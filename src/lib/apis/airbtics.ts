/**
 * Airbtics API — fetches short-term let revenue estimates.
 *
 * Base URL: https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod
 * Auth: x-api-key header
 * Docs: https://documenter.getpostman.com/view/25155751/2sB3QRoSvW
 *
 * Flow:
 *   1. markets/search — find market_id from postcode/city ($0.01)
 *   2. markets/metrics/revenue — monthly revenue with percentiles ($0.20)
 *   3. markets/metrics/occupancy — monthly occupancy ($0.20)
 *   4. markets/metrics/average-daily-rate — monthly ADR ($0.20)
 *   5. markets/metrics/active-listings — competition count ($0.20)
 *   Total: ~$0.81 per analysis
 */

import type { ShortLetData } from '../types';

const BASE_URL = 'https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod';

export async function getShortLetData(
  postcode: string,
  bedrooms: number,
  _guests: number,
): Promise<ShortLetData> {
  const apiKey = process.env.AIRBTICS_API_KEY;

  if (!apiKey) {
    console.log('AIRBTICS_API_KEY not set, using market estimates');
    return generateMarketEstimate(bedrooms);
  }

  try {
    // Step 1: Find market ID from postcode area
    const marketId = await findMarketId(postcode, apiKey);
    if (!marketId) {
      console.log('Airbtics: no market found for postcode, using estimates');
      return generateMarketEstimate(bedrooms);
    }

    // Step 2: Fetch all metrics in parallel
    const [revenueData, occupancyData, adrData, listingsData] = await Promise.allSettled([
      fetchMetric('revenue', marketId, bedrooms, apiKey, 'GBP'),
      fetchMetric('occupancy', marketId, bedrooms, apiKey),
      fetchMetric('average-daily-rate', marketId, bedrooms, apiKey, 'GBP'),
      fetchMetric('active-listings', marketId, bedrooms, apiKey),
    ]);

    const revenue = revenueData.status === 'fulfilled' ? revenueData.value : [];
    const occupancy = occupancyData.status === 'fulfilled' ? occupancyData.value : [];
    const adr = adrData.status === 'fulfilled' ? adrData.value : [];
    const listings = listingsData.status === 'fulfilled' ? listingsData.value : [];

    if (revenue.length === 0) {
      console.log('Airbtics: no revenue data returned, using estimates');
      return generateMarketEstimate(bedrooms);
    }

    // Use p50 (median) values — most realistic for typical performance
    const monthlyRevenue = extractLast12Months(revenue, 'p50');
    const monthlyOccupancy = extractLast12Months(occupancy, 'p50');
    const monthlyAdr = extractLast12Months(adr, 'p50');

    const annualRevenue = monthlyRevenue.reduce((a, b) => a + b, 0);
    const avgOccupancy = monthlyOccupancy.length > 0
      ? monthlyOccupancy.reduce((a, b) => a + b, 0) / monthlyOccupancy.length / 100
      : 0.65;
    const avgAdr = monthlyAdr.length > 0
      ? Math.round(monthlyAdr.reduce((a, b) => a + b, 0) / monthlyAdr.length)
      : 0;

    // Get latest active listings count
    const latestListings = listings.length > 0
      ? (listings[listings.length - 1] as Record<string, number>).count ?? 0
      : 0;

    // Ensure we have exactly 12 months of revenue
    const paddedRevenue = padTo12Months(monthlyRevenue);

    return {
      annualRevenue: Math.round(annualRevenue),
      monthlyRevenue: paddedRevenue,
      occupancyRate: Math.round(avgOccupancy * 100) / 100,
      averageDailyRate: avgAdr,
      activeListings: latestListings,
      comparables: [],
    };
  } catch (err) {
    console.log('Airbtics API error, using market estimates:', err);
    return generateMarketEstimate(bedrooms);
  }
}

/**
 * Finds the Airbtics market_id for a given UK postcode.
 * Extracts the city/area from the postcode prefix and searches.
 */
async function findMarketId(postcode: string, apiKey: string): Promise<number | null> {
  // Extract the outward code (e.g., "M1" from "M1 1AD", "SW1A" from "SW1A 1AA")
  const parts = postcode.trim().split(/\s+/);
  const outwardCode = parts[0];

  // Map common UK postcode prefixes to city names for better search
  const postcodeToCity: Record<string, string> = {
    'M': 'Manchester', 'SW': 'London', 'SE': 'London', 'N': 'London', 'E': 'London',
    'W': 'London', 'EC': 'London', 'WC': 'London', 'NW': 'London',
    'B': 'Birmingham', 'BS': 'Bristol', 'LS': 'Leeds', 'S': 'Sheffield',
    'L': 'Liverpool', 'EH': 'Edinburgh', 'G': 'Glasgow', 'CF': 'Cardiff',
    'NE': 'Newcastle', 'NG': 'Nottingham', 'LE': 'Leicester', 'BN': 'Brighton',
    'OX': 'Oxford', 'CB': 'Cambridge', 'BA': 'Bath', 'YO': 'York',
    'PO': 'Portsmouth', 'SO': 'Southampton', 'CV': 'Coventry', 'DE': 'Derby',
    'EX': 'Exeter', 'PL': 'Plymouth', 'BT': 'Belfast', 'AB': 'Aberdeen',
  };

  // Find the best city name match — sort by prefix length (longest first)
  // so "NE" matches Newcastle before "N" matches London
  let searchQuery = outwardCode;
  const sortedPrefixes = Object.entries(postcodeToCity).sort(
    ([a], [b]) => b.length - a.length,
  );
  for (const [prefix, city] of sortedPrefixes) {
    if (outwardCode.startsWith(prefix)) {
      searchQuery = city;
      break;
    }
  }

  const url = new URL(`${BASE_URL}/markets/search`);
  url.searchParams.set('query', searchQuery);
  url.searchParams.set('country_code', 'GB');

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const markets = data.message;

  if (!Array.isArray(markets) || markets.length === 0) return null;

  // Prefer verified markets
  const verified = markets.find((m: Record<string, unknown>) => m.verified === true);
  return (verified?.id ?? markets[0].id) as number;
}

/**
 * Fetches a specific metric from the Airbtics markets/metrics endpoint.
 */
async function fetchMetric(
  metric: string,
  marketId: number,
  bedrooms: number,
  apiKey: string,
  currency?: string,
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${BASE_URL}/markets/metrics/${metric}`);
  url.searchParams.set('market_id', String(marketId));
  url.searchParams.set('bedrooms', String(bedrooms));
  if (currency) url.searchParams.set('currency', currency);

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) return [];

  const data = await response.json();

  if (data.message === 'insufficient_credits') {
    console.log(`Airbtics: insufficient credits for metrics/${metric}`);
    return [];
  }

  return Array.isArray(data.message) ? data.message : [];
}

/**
 * Extracts the last 12 months of a specific percentile value from metric data.
 */
function extractLast12Months(
  data: Record<string, unknown>[],
  field: string,
): number[] {
  const last12 = data.slice(-12);
  return last12.map((item) => Number(item[field] ?? 0));
}

/**
 * Pads or trims monthly data to exactly 12 entries.
 */
function padTo12Months(data: number[]): ShortLetData['monthlyRevenue'] {
  if (data.length >= 12) {
    return data.slice(-12) as ShortLetData['monthlyRevenue'];
  }
  const padded = [...data];
  while (padded.length < 12) {
    padded.unshift(padded[0] ?? 0);
  }
  return padded as ShortLetData['monthlyRevenue'];
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
