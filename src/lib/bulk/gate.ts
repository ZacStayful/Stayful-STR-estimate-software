// ─── Side-effect gate ─────────────────────────────────────────────
//
// The single most important safety check in the bulk feature.
//
// A failed upstream call does NOT surface as an error. getShortLetData
// swallows everything — a 429, exhausted credit, a 500 — and returns either a
// zeroed shell or generateMarketEstimate(), a SYNTHETIC figure that looks
// entirely plausible. The analysis then "succeeds", and:
//
//   annualRevenue 0 → trueSTRNet = 0 x TRUE_NET_PCT − £5,904 = −£5,904
//                   → upliftPct deeply negative
//                   → getLeadQualification → 'unqualified'
//                   → syncAnalysisToMonday sets status5 → Abandoned
//
// For one lead running the analyser during a blip, that is unfortunate. For a
// 100-row batch during an upstream outage it silently abandons 100 real leads
// on fabricated data, with every row reporting success.
//
// So bulk refuses to write to the CRM unless the data is demonstrably real.
// The live single-property path passes no gate and is unaffected.

import type { AnalysisResult } from '../types.ts';

export interface GateVerdict {
  allow: boolean;
  reason?: string;
}

export function bulkSideEffectGate(result: AnalysisResult): GateVerdict {
  const revenue = result.shortLet?.annualRevenue ?? 0;
  if (!(revenue > 0)) {
    return { allow: false, reason: 'no_str_data: short-let revenue came back as zero' };
  }

  // The tell-tale of a synthetic estimate: generateMarketEstimate() is always
  // returned alongside a quality block with comparablesFound === 0.
  const comparables = result.dataQuality?.comparablesFound ?? 0;
  if (comparables <= 0) {
    return {
      allow: false,
      reason: 'no_str_data: no comparables found — the figure is a synthetic estimate, not market data',
    };
  }

  if (result.dataQuality?.level === 'low') {
    return {
      allow: false,
      reason: 'no_str_data: data quality reported as low',
    };
  }

  return { allow: true };
}

/**
 * Trips a job after enough consecutive rows fail the gate.
 *
 * One gated row is a quiet property. Several in a row is an upstream outage,
 * and continuing would spend the rest of the batch's credit producing nothing.
 */
export class ConsecutiveFailureBreaker {
  private consecutive = 0;
  // Written out rather than as a constructor parameter property: Node's
  // type-stripping (which runs the test suite) does not support those.
  private readonly limit: number;

  constructor(limit = 3) {
    this.limit = limit;
  }

  record(failed: boolean): void {
    this.consecutive = failed ? this.consecutive + 1 : 0;
  }

  get tripped(): boolean {
    return this.consecutive >= this.limit;
  }

  get reason(): string {
    return `${this.consecutive} consecutive rows returned no usable short-let data — paused so the rest of the batch isn't spent on an upstream outage.`;
  }
}
