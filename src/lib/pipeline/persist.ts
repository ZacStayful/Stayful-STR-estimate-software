// ─── Post-analysis side effects ───────────────────────────────────
//
// Everything that happens AFTER the lead has been shown their estimate:
// storing the report, syncing the CRM columns, rendering the PDF and uploading
// it to the lead's Monday item.
//
// Extracted from src/app/api/analyse/route.ts (lines 498-592). Failures are
// logged and swallowed exactly as before — a CRM hiccup must never break a
// live estimate — but the outcome is now RETURNED as well, because the bulk
// upload needs to record per row whether the write actually landed.

import type { AnalysisResult } from '../types.ts';
import { getSupabase } from '../supabase.ts';
import { extractPostcodeArea } from '../utils/postcode.ts';
import { isUnlimited } from '../usage.ts';
import { marketSignals } from './marketSignals.ts';

/**
 * A veto on the CRM write, evaluated after the analysis but before anything is
 * sent to Monday.
 *
 * This exists because a failed upstream call does NOT surface as an error.
 * getShortLetData swallows everything — a 429, an exhausted credit balance, a
 * 500 — and returns either a zeroed shell or generateMarketEstimate(), a
 * synthetic figure with dataQuality.comparablesFound === 0. Either way the
 * analysis "succeeds", and a zero or synthetic revenue drives
 * getLeadQualification to 'unqualified', which moves the lead to Abandoned.
 *
 * One lead hitting that during an outage is unfortunate. A hundred-row batch
 * hitting it silently abandons a hundred real leads on fabricated data, so bulk
 * passes a gate here. The live path passes none and is unaffected.
 */
export type SideEffectGate = (result: AnalysisResult) => { allow: boolean; reason?: string };

export interface PersistOptions {
  email: string | null;
  phone?: string | null;
  source: string;
  incrementUsage: boolean;
  mondayItemId?: string | null;
  gate?: SideEffectGate;
  renderLock?: <T>(fn: () => Promise<T>) => Promise<T>;
}

export interface SideEffectOutcome {
  reportId: string | null;
  mondayItemId: string | null;
  mondaySynced: boolean;
  pdfUploaded: boolean;
  /** Set when the gate vetoed the CRM write. */
  sideEffectsSkippedReason?: string;
}

export async function persistAndSync(
  result: AnalysisResult,
  opts: PersistOptions,
): Promise<SideEffectOutcome> {
  const outcome: SideEffectOutcome = {
    reportId: null,
    mondayItemId: opts.mondayItemId ?? null,
    mondaySynced: false,
    pdfUploaded: false,
  };

  // Derive the report figures once, up front: the storage insert below
  // and the PDF generation in the Monday block (further down) both need
  // them, so we compute here and reuse rather than calling twice.
  const { deriveReportData } = await import('../pdf/derive');
  const reportData = deriveReportData(result);

  // ── Persist the completed report (fire-and-forget) ──────────
  // Pure side-effect: the lead's estimate has ALREADY been flushed to
  // the client via the 'complete' event, so nothing here can slow
  // or alter what they receive. A failed write is swallowed and logged —
  // it must never break a live estimate. This data later feeds the
  // Market Explorer aggregation in Stayful Intelligence.
  try {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[storage] Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset) — skipping report save');
    } else {
      const postcodeArea =
        extractPostcodeArea(result.property.postcode) ??
        extractPostcodeArea(result.property.address);

      const { data, error } = await supabase
        .from('analyser_reports')
        .insert({
          address: result.property.address,
          postcode: result.property.postcode,
          postcode_area: postcodeArea,
          bedrooms: result.property.bedrooms,
          adr: result.shortLet.averageDailyRate,
          occupancy: result.shortLet.occupancyRate,
          // Headline figures, taken from the same derived report the PDF
          // renders from, so stored numbers match what the lead is shown.
          gross_revenue: reportData.overview.grossRevenue,
          net_revenue: reportData.overview.netRevenue,
          property_value_low: reportData.overview.valueConservative,
          property_value_high: reportData.overview.valueUpper,
          // PropertyData sale valuation — null when the call failed or
          // the key is missing.
          purchase_price: result.propertyValuation?.estimatedValue ?? null,
          lead_email: opts.email,
          source: opts.source,
          // Live analyser writes are complete, not PDF-extracted — the
          // extraction_* / filename columns exist for the Monday backfill
          // pipeline, so mark this row as a clean, non-extracted save.
          filename: null,
          extraction_status: 'ok',
          extraction_error: null,
          // Market Explorer signals (competition, demand drivers, coords) —
          // the same fields the migration backfills from raw_response.
          ...marketSignals(result),
          raw_response: result,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[storage] failed to save report:', error);
      } else {
        console.log('[storage] report saved:', data.id);
        outcome.reportId = data.id;
      }
    }
  } catch (err) {
    console.error('[storage] failed to save report:', err);
  }

  // ── CRM gate ────────────────────────────────────────────────
  // Checked before ANY Monday write, so a run built on missing or synthetic
  // upstream data can never reach the board.
  if (opts.gate) {
    const verdict = opts.gate(result);
    if (!verdict.allow) {
      console.warn(`[Monday] CRM write vetoed: ${verdict.reason ?? 'gate rejected'}`);
      outcome.sideEffectsSkippedReason = verdict.reason ?? 'gate rejected';
      return outcome;
    }
  }

  // Monday.com CRM sync + PDF upload — awaited before returning so Vercel
  // doesn't kill the function before they complete.
  const hasSignal = Boolean(opts.mondayItemId || opts.email || opts.phone);
  if (!hasSignal) return outcome;

  try {
    const { syncAnalysisToMonday, uploadPdfToMonday, incrementAnalyserUseCount, resolveLeadItemId } =
      await import('../apis/monday');

    // Resolve the lead ONCE. Previously syncAnalysisToMonday and
    // uploadPdfToMonday each searched independently, which cost two lookups
    // and could in principle disagree with each other.
    const itemId = opts.mondayItemId
      ?? await resolveLeadItemId({
        email: opts.email,
        phone: opts.phone,
        address: result.property.address,
        postcode: result.property.postcode,
      });
    outcome.mondayItemId = itemId;

    const property = {
      address: result.property.address,
      postcode: result.property.postcode,
      phone: opts.phone,
    };
    const emailStr = opts.email ?? '';

    // Run sync, PDF generation, and the usage-counter increment in
    // parallel. The increment counts this completed run toward the
    // email's free-analysis allowance (skipped for the exempt owner,
    // and for bulk, which must not consume leads' free runs).
    const [, syncSettled, pdfSettled] = await Promise.allSettled([
      opts.incrementUsage && emailStr && !isUnlimited(emailStr)
        ? incrementAnalyserUseCount(emailStr)
        : Promise.resolve(),
      itemId
        ? syncAnalysisToMonday(
            emailStr,
            result.financials.longLetNetAnnual,
            result.financials.shortLetNetAnnual,
            result.recommendation,
            property,
            itemId,
          ).then(() => true)
        : Promise.resolve(false),
      itemId
        ? (async () => {
            const React = await import('react');
            const { renderToBuffer } = await import('@react-pdf/renderer');
            const { sanitiseAddressForFilename } = await import('../pdf/derive');
            const { StayfulReport } = await import('../pdf/StayfulReport');
            // Reuse the reportData derived above — don't re-derive.
            const element = React.createElement(StayfulReport, { data: reportData });
            const render = () =>
              (renderToBuffer as (e: unknown) => Promise<Buffer>)(element);
            // Concurrent 6-page renders are memory-hungry; bulk passes a lock.
            const buffer = opts.renderLock ? await opts.renderLock(render) : await render();
            const filename = `Stayful_Property_Analysis_${sanitiseAddressForFilename(result.property.address)}.pdf`;
            await uploadPdfToMonday(emailStr, buffer, filename, property, itemId);
            return true;
          })()
        : Promise.resolve(false),
    ]);

    outcome.mondaySynced = syncSettled.status === 'fulfilled' && syncSettled.value === true;
    outcome.pdfUploaded = pdfSettled.status === 'fulfilled' && pdfSettled.value === true;
    if (pdfSettled.status === 'rejected') {
      console.error('[Monday] PDF render/upload failed:', pdfSettled.reason);
    }
  } catch (err) {
    console.error('[Monday] CRM sync error:', err);
  }

  return outcome;
}
