// ─── Full-time income model: pure building blocks ─────────────────
//
// Helpers for the "full-time" path of buildDataFromReportComps (airbtics.ts):
// which comps trade all year, how far to shrink RevPAR when the subject has
// fewer bedrooms than the pool, when to lift a standout property, and the
// revenue ceiling. Kept free of I/O and of airbtics.ts itself so the rules can
// be unit-tested in isolation. Every threshold lives in pmi-rules.ts.

import {
  FULLTIME_LOOKBACK_MONTHS,
  FULLTIME_MIN_REVENUE_MONTHS,
  OPERATOR_NAME_TERMS,
  OPERATOR_PIPE_MIN_SEGMENTS,
  MIN_FULLTIME_COMPS,
  BED_GAP_SHRINK_PER_BED,
  BED_GAP_SHRINK_FLOOR,
  STANDOUT_SPECIAL_FEATURES,
} from './pmi-rules.ts';

/** The subset of an Airbtics report/all comp the full-time test reads. */
export interface FullTimeCompFields {
  name?: string | null;
  host_name?: string | null;
  revenue_ltm_monthly?: Record<string, number> | null;
}

const MONTH_KEY = /^\d{4}-\d{2}$/;

/**
 * Of the latest FULLTIME_LOOKBACK_MONTHS months in revenue_ltm_monthly, how
 * many took revenue. Missing months count as no revenue, so a listing with
 * only nine months of history can never reach ten.
 */
export function revenueMonthsInLookback(
  monthly: Record<string, number> | null | undefined,
): number {
  if (!monthly) return 0;
  const recent = Object.keys(monthly)
    .filter((k) => MONTH_KEY.test(k))
    .sort()
    .slice(-FULLTIME_LOOKBACK_MONTHS);
  return recent.filter((k) => (monthly[k] ?? 0) > 0).length;
}

const OPERATOR_TERM_RE = new RegExp(`\\b(${OPERATOR_NAME_TERMS.join('|')})\\b`, 'i');

/**
 * Professional-operator signal: an operator term in the host or listing name,
 * or a pipe-separated listing title ("Contractor Base | 4BR | WiFi | Parking").
 */
export function looksLikeOperator(
  name: string | null | undefined,
  hostName: string | null | undefined,
): boolean {
  if (hostName && OPERATOR_TERM_RE.test(hostName)) return true;
  if (!name) return false;
  if (OPERATOR_TERM_RE.test(name)) return true;
  const segments = name.split('|').filter((s) => s.trim().length > 0);
  return segments.length >= OPERATOR_PIPE_MIN_SEGMENTS;
}

export interface FullTimeClassification {
  fullTime: boolean;
  byMonths: boolean;
  byOperator: boolean;
  revenueMonths: number;
}

/**
 * Full-time = revenue in at least FULLTIME_MIN_REVENUE_MONTHS of the last 12
 * months, OR looks like a professional operator. Airbnb-available nights
 * (active_days_count_ltm) are deliberately ignored: multi-channel operators
 * block Airbnb dates for other platforms and would wrongly look part-time.
 */
export function classifyFullTime(comp: FullTimeCompFields): FullTimeClassification {
  const revenueMonths = revenueMonthsInLookback(comp.revenue_ltm_monthly);
  const byMonths = revenueMonths >= FULLTIME_MIN_REVENUE_MONTHS;
  const byOperator = looksLikeOperator(comp.name, comp.host_name);
  return { fullTime: byMonths || byOperator, byMonths, byOperator, revenueMonths };
}

/**
 * Downward bedroom positioning, mirroring BED_GAP_BOOST_PER_BED. When the
 * subject has fewer bedrooms than the pool median: 1 − 0.12 × gap, floored at
 * 0.70. Fractional gaps (pool median 4.5) scale proportionally. Otherwise 1.
 */
export function bedroomShrinkFactor(subjectBeds: number, poolMedianBeds: number): number {
  const gap = poolMedianBeds - subjectBeds;
  if (!(gap > 0)) return 1;
  return Math.max(BED_GAP_SHRINK_FLOOR, 1 - BED_GAP_SHRINK_PER_BED * gap);
}

/** Does the form declare any standout special feature (hot tub, pool, …)? */
export function hasStandoutFeatures(features: readonly string[] | null | undefined): boolean {
  return (features ?? []).some((f) => STANDOUT_SPECIAL_FEATURES.has(f.trim().toLowerCase()));
}

/** Linear-interpolated percentile (p in 0..1). 0 for an empty list. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.max(p, 0), 1) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface RevenueCeiling {
  value: number;
  source: 'fulltime' | 'all_comps';
}

/**
 * The headline may not exceed what the best comparable actually earned.
 * Uses the full-time comps when there are at least MIN_FULLTIME_COMPS of them
 * (so one or two weak full-time comps can't crush the estimate), otherwise
 * every comp. Inputs are actual annual revenues — annualised for young
 * listings but without the ramp-up uplift. Null when nothing has revenue.
 */
export function revenueCeiling(
  fullTimeActuals: readonly number[],
  allActuals: readonly number[],
): RevenueCeiling | null {
  const positive = (xs: readonly number[]) => xs.filter((v) => Number.isFinite(v) && v > 0);
  const ft = positive(fullTimeActuals);
  if (ft.length >= MIN_FULLTIME_COMPS) {
    return { value: Math.max(...ft), source: 'fulltime' };
  }
  const all = positive(allActuals);
  if (all.length === 0) return null;
  return { value: Math.max(...all), source: 'all_comps' };
}

/**
 * After scaling a monthly forecast down to a cap, per-month rounding can leave
 * the total a few pounds over. Take the excess off the largest months so the
 * sum never exceeds the cap.
 */
export function trimMonthlyToCap(monthly: readonly number[], cap: number): number[] {
  const out = [...monthly];
  let excess = out.reduce((s, v) => s + v, 0) - Math.floor(cap);
  while (excess > 0) {
    let maxIdx = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[maxIdx]) maxIdx = i;
    const take = Math.min(excess, out[maxIdx]);
    if (take <= 0) break;
    out[maxIdx] -= take;
    excess -= take;
  }
  return out;
}
