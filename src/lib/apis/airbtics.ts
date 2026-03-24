/**
 * Airbtics API — fetches short-term let revenue estimates.
 *
 * Base URL: https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod
 * Auth: x-api-key header
 * Docs: https://documenter.getpostman.com/view/25155751/2sB3QRoSvW
 *
 * Endpoints used:
 *   - report/summary ($0.10/call) — revenue estimate for a postcode/bedrooms
 *   - report/all ($0.50/call) — full report with comparables and percentiles
 *
 * Falls back to UK market estimates when API is unavailable or has no credits.
 */

import type { ShortLetData, ShortLetComparable } from '../types';

const BASE_URL = 'https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod';

export async function getShortLetData(
  postcode: string,
  bedrooms: number,
  guests: number,
): Promise<ShortLetData> {
  const apiKey = process.env.AIRBTICS_API_KEY;

  if (apiKey) {
    try {
      // Try report/all first for comparables, fall back to report/summary
      const result = await fetchReportAll(postcode, bedrooms, apiKey);
      if (result) return result;

      const summary = await fetchReportSummary(postcode, bedrooms, apiKey);
      if (summary) return summary;

      console.log('Airbtics API returned no data, using market estimates');
    } catch (err) {
      console.log('Airbtics API error, using market estimates:', err);
    }
  } else {
    console.log('AIRBTICS_API_KEY not set, using market estimates');
  }

  return generateMarketEstimate(bedrooms);
}

/**
 * Calls report/all ($0.50) — includes percentiles and 10-40 comparable listings.
 */
async function fetchReportAll(
  postcode: string,
  bedrooms: number,
  apiKey: string,
): Promise<ShortLetData | null> {
  const url = new URL(`${BASE_URL}/report/all`);
  url.searchParams.set('zipcode', postcode);
  url.searchParams.set('bedrooms', String(bedrooms));
  url.searchParams.set('country_code', 'GB');
  url.searchParams.set('currency', 'GBP');

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) return null;

  const data = await response.json();

  if (data.message === 'insufficient_credits' || data.error) {
    console.log('Airbtics report/all:', data.message || data.error);
    return null;
  }

  // Parse comparables from report/all
  const comparables: ShortLetComparable[] = Array.isArray(data.comparables)
    ? data.comparables.map((comp: Record<string, unknown>) => ({
        title: String(comp.title ?? comp.name ?? ''),
        url: String(comp.url ?? comp.listing_url ?? ''),
        bedrooms: Number(comp.bedrooms ?? 0),
        accommodates: Number(comp.accommodates ?? comp.guests ?? 0),
        averageDailyRate: Number(comp.adr ?? comp.average_daily_rate ?? 0),
        occupancyRate: Number(comp.occupancy_rate ?? comp.occ ?? 0),
        annualRevenue: Number(comp.revenue ?? comp.annual_revenue ?? 0),
        distance: comp.distance != null ? Number(comp.distance) : undefined,
      }))
    : [];

  return parseAirbticResponse(data, comparables);
}

/**
 * Calls report/summary ($0.10) — lighter, no comparables.
 */
async function fetchReportSummary(
  postcode: string,
  bedrooms: number,
  apiKey: string,
): Promise<ShortLetData | null> {
  const url = new URL(`${BASE_URL}/report/summary`);
  url.searchParams.set('zipcode', postcode);
  url.searchParams.set('bedrooms', String(bedrooms));
  url.searchParams.set('country_code', 'GB');
  url.searchParams.set('currency', 'GBP');

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) return null;

  const data = await response.json();

  if (data.message === 'insufficient_credits' || data.error) {
    console.log('Airbtics report/summary:', data.message || data.error);
    return null;
  }

  return parseAirbticResponse(data, []);
}

/**
 * Parses Airbtics API response into our ShortLetData type.
 * Handles multiple response shapes from different endpoints.
 */
function parseAirbticResponse(
  data: Record<string, unknown>,
  comparables: ShortLetComparable[],
): ShortLetData | null {
  // Try various field name patterns the API might use
  const annualRevenue = Number(
    data.annual_revenue ?? data.revenue ?? data.estimated_revenue ?? 0,
  );
  const occupancyRate = Number(
    data.occupancy_rate ?? data.occ ?? data.occupancy ?? 0,
  );
  const averageDailyRate = Number(
    data.adr ?? data.average_daily_rate ?? data.avg_daily_rate ?? 0,
  );
  const activeListings = Number(
    data.active_listings ?? data.total_listings ?? data.listing_count ?? 0,
  );

  // If we got no meaningful data, return null
  if (annualRevenue === 0 && averageDailyRate === 0 && occupancyRate === 0) {
    return null;
  }

  const monthlyRevenue = parseMonthlyRevenue(data, annualRevenue);

  return {
    annualRevenue,
    monthlyRevenue,
    occupancyRate: occupancyRate > 1 ? occupancyRate / 100 : occupancyRate,
    averageDailyRate,
    activeListings,
    comparables,
  };
}

/**
 * Attempts to parse monthly revenue from various response shapes.
 */
function parseMonthlyRevenue(
  data: Record<string, unknown>,
  annualRevenue: number,
): ShortLetData['monthlyRevenue'] {
  const empty: ShortLetData['monthlyRevenue'] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  // Shape 1: array of 12 numbers
  if (Array.isArray(data.monthly_revenue) && data.monthly_revenue.length === 12) {
    return data.monthly_revenue.map(Number) as ShortLetData['monthlyRevenue'];
  }

  // Shape 2: object keyed by month
  if (data.monthly_revenue && typeof data.monthly_revenue === 'object') {
    const obj = data.monthly_revenue as Record<string, number>;
    const monthKeys = Object.keys(obj);

    if (monthKeys.length >= 12) {
      const numericAttempt = Array.from({ length: 12 }, (_, i) =>
        Number(obj[String(i + 1)] ?? 0),
      );
      if (numericAttempt.some((v) => v > 0)) {
        return numericAttempt as ShortLetData['monthlyRevenue'];
      }

      const sorted = monthKeys.sort().slice(0, 12);
      return sorted.map((k) => Number(obj[k] ?? 0)) as ShortLetData['monthlyRevenue'];
    }
  }

  // Shape 3: calendar or months array
  const calendar = data.calendar ?? data.months;
  if (Array.isArray(calendar) && calendar.length >= 12) {
    return calendar
      .slice(0, 12)
      .map((m: Record<string, unknown>) =>
        Number(m.revenue ?? m.monthly_revenue ?? 0),
      ) as ShortLetData['monthlyRevenue'];
  }

  // Distribute annual revenue with seasonal variation if we have it
  if (annualRevenue > 0) {
    const seasonalMultipliers = [
      0.82, 0.85, 0.95, 1.00, 1.08, 1.18, 1.25, 1.22, 1.10, 0.98, 0.88, 0.80,
    ];
    const baseMonthly = annualRevenue / 12;
    return seasonalMultipliers.map((m) =>
      Math.round(baseMonthly * m),
    ) as ShortLetData['monthlyRevenue'];
  }

  return empty;
}

/**
 * Generates realistic short-let estimates based on UK market averages.
 * Used when Airbtics API is unavailable or has insufficient credits.
 */
function generateMarketEstimate(bedrooms: number): ShortLetData {
  const adrRanges: Record<number, [number, number]> = {
    1: [85, 100],
    2: [110, 140],
    3: [150, 200],
  };
  const defaultRange: [number, number] = [200, 280];
  const [adrLow, adrHigh] = adrRanges[bedrooms] ?? defaultRange;
  const adr = Math.round((adrLow + adrHigh) / 2);

  const occupancy = bedrooms <= 1 ? 0.72 : bedrooms <= 2 ? 0.70 : bedrooms <= 3 ? 0.67 : 0.65;
  const annualRevenue = Math.round(adr * 365 * occupancy);

  const seasonalMultipliers = [
    0.82, 0.85, 0.95, 1.00, 1.08, 1.18, 1.25, 1.22, 1.10, 0.98, 0.88, 0.80,
  ];
  const baseMonthly = annualRevenue / 12;
  const monthlyRevenue = seasonalMultipliers.map((m) =>
    Math.round(baseMonthly * m),
  ) as ShortLetData['monthlyRevenue'];

  return {
    annualRevenue,
    monthlyRevenue,
    occupancyRate: occupancy,
    averageDailyRate: adr,
    activeListings: 0,
    comparables: [],
  };
}
