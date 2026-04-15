/**
 * PriceLabs Neighborhood Data API integration.
 *
 * Provides a secondary STR data source for cross-validating Airbtics
 * comp aggregations. The Airbtics pipeline (V4 in airbtics.ts) computes
 * the headline figure; PriceLabs is consulted in parallel and used only
 * as a "second opinion" / confidence indicator.
 *
 * Behaviour:
 *  - If PRICELABS_API_KEY env var is missing → returns null (silent skip).
 *  - If the API call fails for any reason (HTTP error, timeout, parse
 *    error) → returns null with a console.error.
 *  - The analyse route MUST handle null gracefully — never block on
 *    PriceLabs failure.
 *
 * Endpoint defaults to https://api.pricelabs.co/v1/neighborhood_data.
 * Override via PRICELABS_API_URL env var if your subscription uses a
 * different base URL.
 *
 * Response parser is defensive: looks for common field names because
 * PriceLabs has shipped multiple response shapes over time.
 */

const DEFAULT_BASE_URL = 'https://api.pricelabs.co/v1/neighborhood_data';
const REQUEST_TIMEOUT_MS = 10_000;

export interface PriceLabsNeighborhoodResult {
  medianAdr: number;       // GBP, may be 0 if not provided
  medianOccupancy: number; // 0–1 fraction
  medianRevpar: number;    // GBP per available day
  source: string;          // e.g. 'pricelabs_neighborhood_data'
  raw?: unknown;           // raw response for debugging
}

/**
 * Coerce a value that might be a percentage (0-100) or a fraction (0-1)
 * into a 0-1 fraction. Mirrors normaliseOccupancy in airbtics.ts.
 */
function toFraction(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

/**
 * Pull the first defined number from a list of candidate field paths.
 * PriceLabs docs have used different field names over time.
 */
function pickNumber(obj: unknown, paths: string[]): number {
  if (!obj || typeof obj !== 'object') return 0;
  for (const path of paths) {
    let cursor: unknown = obj;
    for (const key of path.split('.')) {
      if (cursor && typeof cursor === 'object' && key in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[key];
      } else {
        cursor = undefined;
        break;
      }
    }
    const n = typeof cursor === 'number' ? cursor : Number(cursor);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Fetch neighborhood market stats for a UK property location.
 *
 * Returns null on any failure — caller MUST handle null without throwing.
 *
 * @param lat       Property latitude
 * @param lng       Property longitude
 * @param bedrooms  Subject bedroom count (used for bedroom-specific stats)
 */
export async function fetchPriceLabsNeighborhood(
  lat: number,
  lng: number,
  bedrooms: number,
): Promise<PriceLabsNeighborhoodResult | null> {
  const apiKey = process.env.PRICELABS_API_KEY;
  if (!apiKey) {
    console.log('[PriceLabs] PRICELABS_API_KEY not set — skipping cross-validation');
    return null;
  }

  const baseUrl = process.env.PRICELABS_API_URL || DEFAULT_BASE_URL;
  const url = new URL(baseUrl);
  // Common parameter names — adjust if your subscription uses different keys.
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('bedrooms', String(bedrooms));
  url.searchParams.set('country', 'GB');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.log(`[PriceLabs] GET ${url.toString().replace(apiKey, '<redacted>')}`);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    console.log(`[PriceLabs] HTTP ${response.status}`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[PriceLabs] non-200 response (${response.status}): ${body.slice(0, 300)}`);
      return null;
    }

    const data = await response.json().catch((err) => {
      console.error('[PriceLabs] JSON parse error:', err);
      return null;
    });
    if (!data) return null;

    // Defensive parsing — try multiple known field names.
    const adr = pickNumber(data, [
      'median_adr',
      'adr',
      'data.median_adr',
      'data.adr',
      'neighborhood.median_adr',
      'stats.median_adr',
    ]);
    const occupancyRaw = pickNumber(data, [
      'median_occupancy',
      'occupancy',
      'data.median_occupancy',
      'data.occupancy',
      'neighborhood.median_occupancy',
      'stats.median_occupancy',
    ]);
    const revparRaw = pickNumber(data, [
      'median_revpar',
      'revpar',
      'data.median_revpar',
      'data.revpar',
      'neighborhood.median_revpar',
      'stats.median_revpar',
    ]);

    const medianOccupancy = toFraction(occupancyRaw);
    const medianRevpar = revparRaw > 0 ? revparRaw : (adr * medianOccupancy);

    if (adr === 0 && medianRevpar === 0) {
      console.error('[PriceLabs] response did not contain recognised median_adr / median_occupancy / median_revpar fields. Sample keys:', Object.keys(data || {}).slice(0, 10));
      return null;
    }

    const result: PriceLabsNeighborhoodResult = {
      medianAdr: adr,
      medianOccupancy,
      medianRevpar,
      source: 'pricelabs_neighborhood_data',
      raw: data,
    };

    console.log(`[PriceLabs] parsed: adr=£${adr.toFixed(0)}, occ=${(medianOccupancy * 100).toFixed(0)}%, revpar=£${medianRevpar.toFixed(2)}`);
    return result;
  } catch (err) {
    clearTimeout(timer);
    console.error('[PriceLabs] fetch failed:', err);
    return null;
  }
}

/**
 * Cross-validate an Airbtics-derived revenue against PriceLabs neighborhood data.
 * Returns a confidence label and divergence percentage.
 *
 * Confidence rules:
 *   |divergence| <= 15%  → 'high'
 *   |divergence| <= 30%  → 'medium'
 *   |divergence| > 30%   → 'low'
 *
 * If PriceLabs result is null (skipped or failed), confidence defaults to
 * 'unverified' — meaning we have only the Airbtics signal.
 */
export type CrossValidationConfidence = 'high' | 'medium' | 'low' | 'unverified';

export interface CrossValidationResult {
  confidence: CrossValidationConfidence;
  airbticsRevenue: number;
  priceLabsRevenue: number | null;
  divergencePct: number | null;
  note: string;
}

export function crossValidate(
  airbticsAnnualRevenue: number,
  priceLabs: PriceLabsNeighborhoodResult | null,
): CrossValidationResult {
  if (!priceLabs || priceLabs.medianRevpar <= 0) {
    return {
      confidence: 'unverified',
      airbticsRevenue: airbticsAnnualRevenue,
      priceLabsRevenue: null,
      divergencePct: null,
      note: 'PriceLabs cross-validation unavailable — single-source estimate.',
    };
  }

  const priceLabsRevenue = Math.round(priceLabs.medianRevpar * 365);
  const divergencePct = airbticsAnnualRevenue > 0
    ? ((airbticsAnnualRevenue - priceLabsRevenue) / airbticsAnnualRevenue) * 100
    : 0;
  const abs = Math.abs(divergencePct);

  let confidence: CrossValidationConfidence;
  let note: string;
  if (abs <= 15) {
    confidence = 'high';
    note = `Both Airbtics and PriceLabs agree within ${abs.toFixed(1)}%.`;
  } else if (abs <= 30) {
    confidence = 'medium';
    note = `Airbtics and PriceLabs differ by ${abs.toFixed(1)}% — moderate confidence.`;
  } else {
    confidence = 'low';
    note = `Airbtics and PriceLabs differ by ${abs.toFixed(1)}% — low confidence, market may be volatile or thin.`;
  }

  return {
    confidence,
    airbticsRevenue: airbticsAnnualRevenue,
    priceLabsRevenue,
    divergencePct,
    note,
  };
}
