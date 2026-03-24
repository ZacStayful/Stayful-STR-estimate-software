/**
 * PropertyData API — fetches long-term rental valuation data.
 *
 * The API returns rent in GBP per WEEK. We convert to monthly by multiplying
 * by 52/12. There are no comparables or high/low estimates in the response,
 * so we derive those from the point estimate.
 */

import type { LongLetData } from '../types';

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

  // PropertyData requires the postcode WITH spaces — do NOT strip them
  const url = new URL('https://api.propertydata.co.uk/valuation-rent');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('postcode', postcode);
  url.searchParams.set('property_type', options?.propertyType ?? 'flat');
  url.searchParams.set('construction_date', options?.constructionDate ?? '2000_onwards');
  url.searchParams.set('internal_area', String(Math.max(options?.internalArea ?? 650, 300)));
  url.searchParams.set('bedrooms', String(bedrooms));
  url.searchParams.set('bathrooms', String(options?.bathrooms ?? 1));
  url.searchParams.set('finish_quality', options?.finishQuality ?? 'average');
  url.searchParams.set('outdoor_space', options?.outdoorSpace ?? 'none');
  url.searchParams.set('off_street_parking', String(options?.offStreetParking ?? 0));

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `PropertyData API returned HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (data.status === 'error') {
    throw new Error(
      `PropertyData API error: ${data.message ?? 'Unknown error'}`,
    );
  }

  // Response: { "status": "success", "result": { "estimate": 842, "unit": "gbp_per_week" } }
  const weeklyRent = Number(data.result?.estimate ?? 0);

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
}
