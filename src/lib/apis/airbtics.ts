/**
 * Airbtics API — fetches short-term let revenue estimates + real nearby comparables.
 *
 * Base URL: https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod
 * Auth: x-api-key header
 * Docs: https://documenter.getpostman.com/view/25155751/2sB3QRoSvW
 *
 * Flow:
 *   1. markets/search — find market_id from postcode/city ($0.01)
 *   2. markets/metrics/revenue — monthly revenue with percentiles ($0.20)
 *   3. markets/metrics/occupancy — monthly occupancy ($0.20)
 *   4. listings/search/bounds — real nearby comparable listings ($0.05)
 *   5. Derive ADR from: revenue / (occupancy * days_in_month)
 *   Total: ~$0.46 per analysis
 */

import type { ShortLetData, ShortLetComparable } from '../types';

const BASE_URL = process.env.AIRBTICS_BASE_URL || 'https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod';

// ─── In-memory cache for market_id lookups ──────────────────────
// Prevents duplicate search calls for the same postcode area.
const marketIdCache = new Map<string, { id: number | null; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Clean up stale cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of marketIdCache) {
    if (now > entry.expiresAt) marketIdCache.delete(key);
  }
}, 600_000);

/**
 * Calculates distance in km between two lat/lng points using the Haversine formula.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export async function getShortLetData(
  postcode: string,
  bedrooms: number,
  _guests: number,
  lat: number,
  lng: number,
): Promise<ShortLetData> {
  const apiKey = process.env.AIRBTICS_API_KEY;

  if (!apiKey) {
    console.log('AIRBTICS_API_KEY not set, using market estimates');
    return generateMarketEstimate(bedrooms);
  }

  try {
    // Step 1: Find market ID from postcode area (cached)
    const marketId = await findMarketId(postcode, apiKey);
    if (!marketId) {
      console.log('Airbtics: no market found for postcode, using estimates');
      return generateMarketEstimate(bedrooms);
    }

    // Step 2: Fetch ALL data in parallel for maximum accuracy ($0.70 total)
    // summary ($0.25) + revenue ($0.20) + occupancy ($0.20) + listings ($0.05)
    const [summaryData, revenueData, occupancyData, listingsData] = await Promise.allSettled([
      fetchMarketSummary(marketId, bedrooms, apiKey),
      fetchMetric('revenue', marketId, bedrooms, apiKey, 'GBP'),
      fetchMetric('occupancy', marketId, bedrooms, apiKey),
      fetchNearbyListings(lat, lng, apiKey),
    ]);

    const summary = summaryData.status === 'fulfilled' ? summaryData.value : null;
    const revenue = revenueData.status === 'fulfilled' ? revenueData.value : [];
    const occupancy = occupancyData.status === 'fulfilled' ? occupancyData.value : [];
    const listingsResult = listingsData.status === 'fulfilled' ? listingsData.value : null;

    // If no monthly data AND no summary, fall back to estimates
    if (revenue.length === 0 && !summary) {
      console.log('Airbtics: no data available, using market estimates');
      return generateMarketEstimate(bedrooms);
    }

    // Use summary as primary source (bedroom-specific, always accurate)
    // Monthly metrics as secondary for seasonal breakdown
    const summaryRevenue = summary?.revenue ?? 0;
    const summaryOccupancy = summary?.occupancy ? summary.occupancy / 100 : 0;
    const summaryAdr = summary?.average_daily_rate ?? 0;

    // Monthly breakdown from metrics (if available), otherwise distribute summary evenly with seasonal weighting
    let monthlyRevenue: number[];
    let avgOccupancy: number;

    if (revenue.length > 0) {
      monthlyRevenue = extractLast12Months(revenue, 'p50');
      const monthlyOccupancy = extractLast12Months(occupancy, 'p50');
      avgOccupancy = monthlyOccupancy.length > 0
        ? monthlyOccupancy.reduce((a, b) => a + b, 0) / monthlyOccupancy.length / 100
        : summaryOccupancy || 0.65;
    } else {
      // Use summary annual revenue distributed with seasonal weighting
      const base = (summaryRevenue || generateMarketEstimate(bedrooms).annualRevenue) / 12;
      const seasonalMultipliers = [0.82, 0.85, 0.95, 1.00, 1.08, 1.18, 1.25, 1.22, 1.10, 0.98, 0.88, 0.80];
      monthlyRevenue = seasonalMultipliers.map(m => Math.round(base * m));
      avgOccupancy = summaryOccupancy || 0.65;
    }

    const annualRevenue = summaryRevenue || monthlyRevenue.reduce((a, b) => a + b, 0);
    const derivedAdr = summaryAdr || Math.round(annualRevenue / 12 / ((avgOccupancy || 0.65) * 30));

    // Process nearby listings into comparables
    let comparables: ShortLetComparable[] = [];
    let activeListings = 0;

    if (listingsResult) {
      // Filter by exact bedroom match for comparables
      const bedroomMatches = listingsResult.listings.filter(
        (l: AirbticsListing) => l.bedrooms === bedrooms,
      );

      // activeListings = count of bedroom-matched listings in the area
      activeListings = bedroomMatches.length;

      // Sort by distance from property coordinates
      const withDistance = bedroomMatches.map((l: AirbticsListing) => ({
        ...l,
        distance: haversineKm(lat, lng, l.latitude, l.longitude),
      }));
      withDistance.sort((a, b) => a.distance - b.distance);

      // Take top 10 closest matching listings
      comparables = withDistance.slice(0, 10).map((l): ShortLetComparable => {
        const addedOn = l.added_on ? new Date(l.added_on) : null;
        const ageYears = addedOn
          ? Math.max(0, Math.round((Date.now() - addedOn.getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10)
          : 0;

        return {
          title: l.name || 'Airbnb Listing',
          url: `https://www.airbnb.co.uk/rooms/${l.listingID}`,
          bedrooms: l.bedrooms ?? 0,
          accommodates: l.accommodates ?? 0,
          averageDailyRate: Math.round(l.avg_booked_daily_rate_ltm ?? 0),
          occupancyRate: Math.round(l.avg_occupancy_rate_ltm ?? 0) / 100,
          annualRevenue: Math.round(l.annual_revenue_ltm ?? 0),
          distance: l.distance,
          rating: Math.round(((l.reveiw_scores_rating ?? 0) / 20) * 10) / 10, // 0-100 → 0-5
          reviewCount: l.visible_review_count ?? 0,
          listingAge: ageYears,
          daysAvailable: l.active_days_count_ltm ?? 0,
        };
      });
    }

    // Use summary active_listings_count as fallback (bedroom-specific market count)
    if (activeListings === 0 && summary?.active_listings_count) {
      activeListings = summary.active_listings_count;
    }

    // Ensure we have exactly 12 months of revenue
    const paddedRevenue = padTo12Months(monthlyRevenue);

    return {
      annualRevenue: Math.round(annualRevenue),
      monthlyRevenue: paddedRevenue,
      occupancyRate: Math.round(avgOccupancy * 100) / 100,
      averageDailyRate: derivedAdr,
      activeListings,
      comparables,
    };
  } catch (err) {
    console.log('Airbtics API error, using market estimates:', err);
    return generateMarketEstimate(bedrooms);
  }
}

// ─── Airbtics listing shape from bounds endpoint ────────────────
interface AirbticsListing {
  listingID: string;
  name: string;
  thumbnail_url: string;
  latitude: number;
  longitude: number;
  bedrooms: number;
  bathrooms: number;
  accommodates: number;
  room_type: string;
  property_type: string;
  added_on: string;
  visible_review_count: number;
  reveiw_scores_rating: number; // note: API typo
  avg_booked_daily_rate_ltm: number;
  avg_occupancy_rate_ltm: number;
  annual_revenue_ltm: number;
  active_days_count_ltm: number;
}

interface BoundsResponse {
  totalCount: number;
  listings: AirbticsListing[];
}

/**
 * Fetches nearby listings within ~1.5km bounding box using the bounds endpoint.
 * Cost: $0.05/call
 */
async function fetchNearbyListings(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<BoundsResponse | null> {
  // Create a bounding box ~1.5km around the property
  // At UK latitudes (~52-55°N), 1° lat ≈ 111km, 1° lng ≈ 65km
  const latOffset = 1.5 / 111;    // ~0.0135°
  const lngOffset = 1.5 / 65;     // ~0.0231°

  const body = {
    bounds: {
      ne_lat: lat + latOffset,
      ne_lng: lng + lngOffset,
      sw_lat: lat - latOffset,
      sw_lng: lng - lngOffset,
    },
    currency: 'GBP',
  };

  const response = await fetch(`${BASE_URL}/listings/search/bounds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`Airbtics bounds search returned HTTP ${response.status}`);
    return null;
  }

  const data = await response.json();

  if (data.message === 'insufficient_credits') {
    console.log('Airbtics: insufficient credits for listings/search/bounds');
    return null;
  }

  const totalCount = data.message?.total_count ?? 0;

  // The listings field is a JSON string that needs double-parsing
  let listings: AirbticsListing[] = [];
  if (data.message?.listings) {
    try {
      const parsed = typeof data.message.listings === 'string'
        ? JSON.parse(data.message.listings)
        : data.message.listings;
      listings = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Airbtics: failed to parse listings JSON:', e);
    }
  }

  return { totalCount, listings };
}

interface MarketSummary {
  occupancy: number;
  average_daily_rate: number;
  revenue: number;
  active_listings_count: number;
  market_grade: string;
  regulations: string;
}

/**
 * Fetches bedroom-specific market summary. Cost: $0.25/call.
 * Returns ADR, occupancy, revenue, and active listings count for the specific bedroom count.
 */
async function fetchMarketSummary(
  marketId: number,
  bedrooms: number,
  apiKey: string,
): Promise<MarketSummary | null> {
  const url = new URL(`${BASE_URL}/markets/summary`);
  url.searchParams.set('market_id', String(marketId));
  url.searchParams.set('bedrooms', String(bedrooms));
  url.searchParams.set('currency', 'GBP');

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) return null;

  const data = await response.json();
  if (data.message === 'insufficient_credits' || typeof data.message !== 'object') {
    return null;
  }

  return data.message as MarketSummary;
}

/**
 * Finds the Airbtics market_id for a given UK postcode.
 * Extracts the city/area from the postcode prefix and searches.
 * Results are cached in memory to avoid repeat search calls.
 */
async function findMarketId(postcode: string, apiKey: string): Promise<number | null> {
  // Extract the outward code (e.g., "M1" from "M1 1AD", "SW1A" from "SW1A 1AA")
  const parts = postcode.trim().split(/\s+/);
  const outwardCode = parts[0];

  // Check cache first
  const cacheKey = outwardCode.toUpperCase();
  const cached = marketIdCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.id;
  }

  // Hardcoded market IDs for common UK cities — saves $0.01/call and avoids
  // "insufficient_credits" failures on the search endpoint
  const KNOWN_MARKETS: Record<string, number> = {
    'Manchester': 144265, 'London': 142929, 'Birmingham': 142853,
    'Bristol': 142858, 'Leeds': 142907, 'Sheffield': 142969,
    'Liverpool': 142912, 'Edinburgh': 142876, 'Glasgow': 142890,
    'Cardiff': 142863, 'Newcastle': 142928, 'Nottingham': 142941,
    'Leicester': 142910, 'Brighton': 142857, 'Oxford': 142946,
    'Cambridge': 142862, 'Bath': 142848, 'York': 143002,
    'Portsmouth': 142953, 'Southampton': 142973, 'Coventry': 142870,
    'Derby': 142873, 'Exeter': 142880, 'Plymouth': 142951,
    'Belfast': 142850, 'Aberdeen': 142838,
  };

  // Map postcode prefix to city name
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

  // Find city name — sort by prefix length (longest first)
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

  // Try hardcoded market ID first (free, no API call)
  if (KNOWN_MARKETS[searchQuery]) {
    const marketId = KNOWN_MARKETS[searchQuery];
    marketIdCache.set(cacheKey, { id: marketId, expiresAt: Date.now() + CACHE_TTL_MS });
    return marketId;
  }

  // Fall back to API search for unknown cities
  const url = new URL(`${BASE_URL}/markets/search`);
  url.searchParams.set('query', searchQuery);
  url.searchParams.set('country_code', 'GB');

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) {
    marketIdCache.set(cacheKey, { id: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  const data = await response.json();
  const markets = data.message;

  if (!Array.isArray(markets) || markets.length === 0 || data.message === 'insufficient_credits') {
    marketIdCache.set(cacheKey, { id: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  // Prefer verified markets
  const verified = markets.find((m: Record<string, unknown>) => m.verified === true);
  const marketId = (verified?.id ?? markets[0].id) as number;

  // Cache the result
  marketIdCache.set(cacheKey, { id: marketId, expiresAt: Date.now() + CACHE_TTL_MS });

  return marketId;
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
