// ─── The analyser_reports row ─────────────────────────────────────
//
// What persistAndSync stores for every completed analysis, built here so the
// stored shape can be tested without a database. STR-Website-2's Market
// Explorer is built from this table, so what goes in here is what the market
// data is made of.
//
// ── Rows from the lead database (source 'lead_db') ─────────────────
//
// /api/internal/analyse serves the Stayful lead database: a customer paid to
// analyse a property from their OWN lead list. The run is kept — adding it to
// the market data is the point — but it is kept WITHOUT the street address:
//
//   • `address` is null;
//   • `lat` / `lng` are rounded to 2 decimal places (~1 km). That still places
//     the row in its area for the planning-signals centroids, not at a door;
//   • `raw_response` is a COPY with `property.address` replaced by the postcode
//     and `coordinates` rounded the same way.
//
// The postcode, bedroom count and every figure are unchanged. Nothing in
// STR-Website-2 reads the address: it reads postcode, postcode_area, bedrooms,
// the figure columns, and raw_response's shortLet.monthlyRevenue,
// longLet.monthlyRent, dataQuality and comparable URLs.
//
// ⚠️ `result` is NEVER mutated. The route renders the customer's own PDF from it
// after this runs, and that PDF must carry the full address.
//
// ── Retries (request_id) ────────────────────────────────────────────
//
// The lead database gives up on a slow row at 45 seconds while this app keeps
// running to its 60-second ceiling, so a run can finish and be stored after the
// caller has already scheduled its retry. The caller's request id is stored and
// a partial unique index on (source, request_id) makes the retry find the first
// row instead of adding a second one for the same property. The column is only
// written when a request id is given, so every other source's insert is exactly
// what it was before the column existed.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalysisResult } from '../types.ts';
import { extractPostcodeArea } from '../utils/postcode.ts';
import { marketSignals } from './marketSignals.ts';

/** analyser_reports.source for runs requested by the Stayful lead database. */
export const LEAD_DB_SOURCE = 'lead_db';

/** The headline figures, taken from the same derived report the PDF renders. */
export interface ReportFigures {
  overview: {
    grossRevenue: number;
    netRevenue: number;
    valueConservative: number | null;
    valueUpper: number | null;
  };
}

export interface ReportRowOptions {
  email: string | null;
  source: string;
  /** The caller's own id for this run. Stored so a retry reuses the row. */
  requestId?: string | null;
}

export type ReportRow = Record<string, unknown>;

/** 2 decimal places of a degree: about 1.1 km north-south in the UK. */
function roundCoordinate(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * The copy of the result stored for a lead-database run: the street address
 * replaced by the postcode and the coordinates rounded. A new object at every
 * level that changes, so the caller's `result` is left exactly as it was.
 */
export function withoutStreetAddress(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    property: { ...result.property, address: result.property.postcode },
    coordinates: {
      ...result.coordinates,
      lat: roundCoordinate(result.coordinates?.lat) as number,
      lng: roundCoordinate(result.coordinates?.lng) as number,
    },
  };
}

function requestIdOf(opts: ReportRowOptions): string | null {
  const id = typeof opts.requestId === 'string' ? opts.requestId.trim() : '';
  return id ? id : null;
}

export function buildReportRow(
  result: AnalysisResult,
  reportData: ReportFigures,
  opts: ReportRowOptions,
): ReportRow {
  const postcodeArea =
    extractPostcodeArea(result.property.postcode) ??
    extractPostcodeArea(result.property.address);

  const row: ReportRow = {
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
  };

  const requestId = requestIdOf(opts);
  if (requestId) row.request_id = requestId;

  if (opts.source === LEAD_DB_SOURCE) {
    // After the marketSignals spread above, which sets lat / lng: rounding
    // before it would be overwritten by the exact values.
    row.address = null;
    row.lat = roundCoordinate(row.lat as number | null);
    row.lng = roundCoordinate(row.lng as number | null);
    row.raw_response = withoutStreetAddress(result);
  }

  return row;
}

/** Postgres unique_violation. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
}

/**
 * Inserts the row and returns its id, or null when it could not be stored.
 * Never throws — a failed write must never break a live estimate.
 *
 * A duplicate request id is not a failure: it means an earlier attempt of the
 * same run already stored this property, so that row's id is returned instead.
 */
export async function saveReportRow(
  supabase: SupabaseClient,
  row: ReportRow,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('analyser_reports')
      .insert(row)
      .select('id')
      .single();

    if (!error && data) {
      console.log('[storage] report saved:', data.id);
      return data.id as string;
    }

    const requestId = typeof row.request_id === 'string' ? row.request_id : null;
    if (requestId && isUniqueViolation(error)) {
      const { data: existing, error: lookupError } = await supabase
        .from('analyser_reports')
        .select('id')
        .eq('source', String(row.source))
        .eq('request_id', requestId)
        .maybeSingle();
      if (existing) {
        console.log('[storage] report already saved for this request:', existing.id);
        return existing.id as string;
      }
      console.error('[storage] duplicate request, but the earlier row could not be read:', lookupError);
      return null;
    }

    console.error('[storage] failed to save report:', error);
    return null;
  } catch (err) {
    console.error('[storage] failed to save report:', err);
    return null;
  }
}
