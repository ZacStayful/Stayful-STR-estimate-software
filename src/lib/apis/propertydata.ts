/**
 * PropertyData API — fetches long-term rental valuation data.
 *
 * The API returns rent in GBP per WEEK. We convert to monthly by multiplying
 * by 52/12. There are no comparables or high/low estimates in the response,
 * so we derive those from the point estimate.
 *
 * Retry strategy: if the first attempt fails (API requires ALL params and
 * rejects invalid combos), retry with progressively simpler defaults.
 */

import type { LongLetData } from '../types';

// ─── Bedroom-scaled defaults ────────────────────────────────────
// More realistic than a single static default for all property sizes.
const AREA_BY_BEDROOMS: Record<number, number> = {
  1: 450, 2: 650, 3: 900, 4: 1200, 5: 1500,
};

const BATHROOMS_BY_BEDROOMS: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3,
};

export async function getLongLetData(
  postcode: string,
  bedrooms: number,
  options?: {
    propertyType?: string;
    constructionDate?: string;
    internalArea?: number;
    bathrooms?: number;
    finishQuality?: string;
    outdoorSpace?: string;
    offStreetParking?: number;
  },
): Promise<LongLetData> {
  const apiKey = process.env.PROPERTYDATA_API_KEY;
  if (!apiKey) {
    throw new Error('PROPERTYDATA_API_KEY is not set in environment variables.');
  }

  const clampedBedrooms = Math.max(1, Math.min(bedrooms, 5));

  // Attempt 1: Full params with bedroom-scaled defaults + high finish
  const attempt1Params = {
    postcode,
    property_type: options?.propertyType ?? 'flat',
    construction_date: options?.constructionDate ?? '2000_onwards',
    internal_area: String(Math.max(options?.internalArea ?? AREA_BY_BEDROOMS[clampedBedrooms] ?? 650, 300)),
    bedrooms: String(bedrooms),
    bathrooms: String(options?.bathrooms ?? BATHROOMS_BY_BEDROOMS[clampedBedrooms] ?? 1),
    finish_quality: options?.finishQuality ?? 'high',
    outdoor_space: options?.outdoorSpace ?? 'none',
    off_street_parking: String(options?.offStreetParking ?? 0),
  };

  const result1 = await tryPropertyDataCall(apiKey, attempt1Params);
  if (result1) {
    console.log('PropertyData: succeeded on attempt 1 (full params, high finish)');
    return result1;
  }

  // Attempt 2: Simpler defaults — flat, broader construction date, average finish
  const attempt2Params = {
    postcode,
    property_type: 'flat',
    construction_date: '1914_2000',
    internal_area: String(AREA_BY_BEDROOMS[clampedBedrooms] ?? 650),
    bedrooms: String(bedrooms),
    bathrooms: String(BATHROOMS_BY_BEDROOMS[clampedBedrooms] ?? 1),
    finish_quality: 'average',
    outdoor_space: 'none',
    off_street_parking: '0',
  };

  const result2 = await tryPropertyDataCall(apiKey, attempt2Params);
  if (result2) {
    console.log('PropertyData: succeeded on attempt 2 (simpler defaults)');
    return result2;
  }

  // Attempt 3: Minimal — smallest safe values
  const attempt3Params = {
    postcode,
    property_type: 'flat',
    construction_date: '1914_2000',
    internal_area: '500',
    bedrooms: String(bedrooms),
    bathrooms: '1',
    finish_quality: 'average',
    outdoor_space: 'none',
    off_street_parking: '0',
  };

  const result3 = await tryPropertyDataCall(apiKey, attempt3Params);
  if (result3) {
    console.log('PropertyData: succeeded on attempt 3 (minimal params)');
    return result3;
  }

  // All attempts failed
  throw new Error('PropertyData API: all 3 attempts failed. The postcode may not have enough rental data.');
}

/**
 * Makes a single PropertyData valuation-rent call. Returns null on failure.
 */
async function tryPropertyDataCall(
  apiKey: string,
  params: Record<string, string>,
): Promise<LongLetData | null> {
  try {
    // PropertyData requires the postcode WITH spaces — do NOT strip them
    const url = new URL('https://api.propertydata.co.uk/valuation-rent');
    url.searchParams.set('key', apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.log(`PropertyData: HTTP ${response.status} for params:`, params);
      return null;
    }

    const data = await response.json();

    if (data.status === 'error') {
      console.log(`PropertyData: API error "${data.message}" for params:`, params);
      return null;
    }

    // Response: { "status": "success", "result": { "estimate": 842, "unit": "gbp_per_week" } }
    const weeklyRent = Number(data.result?.estimate ?? 0);

    if (weeklyRent <= 0) {
      console.log('PropertyData: got zero/negative weekly rent');
      return null;
    }

    // Convert weekly to monthly: weekly * 52 / 12
    const monthlyRent = Math.round(weeklyRent * 52 / 12);

    // No high/low in the API response — derive from point estimate
    const estimateHigh = Math.round(monthlyRent * 1.15);
    const estimateLow = Math.round(monthlyRent * 0.85);

    return {
      monthlyRent,
      estimateHigh,
      estimateLow,
      comparables: [],
    };
  } catch (err) {
    console.log('PropertyData: fetch error:', err);
    return null;
  }
}
