/**
 * Airbtics API — fetches short-term let revenue estimates + real nearby comparables.
 *
 * Base URL: https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod
 * Auth: x-api-key header
 * Docs: https://documenter.getpostman.com/view/25155751/2sB3QRoSvW
 *
 * PRIMARY flow (report/all — $0.50, highest accuracy):
 *   1. POST report/all with lat/lng/bedrooms → returns report_id
 *   2. GET report?id=<id> → poll until comps_status === "success"
 *   3. Parse ~40 comparables with full LTM data (revenue, ADR, occupancy, monthly)
 *
 * FALLBACK flow (markets + bounds — ~$0.46):
 *   1. markets/search — find market_id from postcode/city ($0.01)
 *   2. markets/summary — bedroom-specific summary ($0.25)
 *   3. markets/metrics/revenue + occupancy ($0.40)
 *   4. listings/search/bounds — nearby comparables ($0.05)
 */

import type { ShortLetData, ShortLetComparable, DataQuality } from '../types';

const BASE_URL = process.env.AIRBTICS_BASE_URL || 'https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod';

const TARGET_COMPARABLES = 12;
const SEARCH_RADII_KM = [0.4, 0.8, 1.6, 2.4, 3.2, 4.8, 8.0]; // PMI-equivalent steps (0.25mi–5mi in km)
const REPORT_POLL_INTERVAL_MS = 2000;
const REPORT_POLL_MAX_MS = 25000; // 25 seconds (up from 15)

// "Good operator" uplift applied to market fallback data.
// Based on observed difference: report/all p60 is ~25% above market median.
const GOOD_OPERATOR_UPLIFT = 1.25;

// ─── In-memory cache for report IDs ─────────────────────────────
// Reading existing reports is FREE. Cache report_id by postcode+bedrooms
// so the same property only costs $0.50 once.
const reportCache = new Map<string, { reportId: string; expiresAt: number }>();
const REPORT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (reports don't change that fast)

// ─── In-memory cache for market_id lookups ──────────────────────
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
  guests: number,
  lat: number,
  lng: number,
  options?: { bathrooms?: number; hasParking?: boolean; finishQuality?: string },
): Promise<{ data: ShortLetData; quality: DataQuality }> {
  const apiKey = process.env.AIRBTICS_API_KEY;

  const lowQuality: DataQuality = {
    comparablesFound: 0, comparablesTarget: TARGET_COMPARABLES,
    searchRadiusKm: 0, searchBroadened: false, level: 'low',
    disclaimer: 'Limited data available for this area. This property may be in a unique or rural location, which can be advantageous for short-term letting. Book a web meeting with Stayful for a more detailed, personalised assessment.',
  };

  if (!apiKey) {
    console.log('AIRBTICS_API_KEY not set, using market estimates');
    return { data: generateMarketEstimate(bedrooms), quality: lowQuality };
  }

  // ── PRIMARY: Try report/all ($0.50, highest accuracy with real comps) ──
  let reportAllResult: { data: ShortLetData; quality: DataQuality } | null = null;
  try {
    const reportResult = await fetchReportAll(lat, lng, bedrooms, guests, apiKey, postcode, options?.bathrooms);
    if (reportResult) {
      console.log(`[Airbtics] report/all returned ${reportResult.comps.length} raw comps`);
      reportAllResult = buildDataFromReportComps(reportResult, bedrooms, guests, lat, lng, options?.hasParking, options?.finishQuality);

      // If we got 12+ quality comps, use the report result directly
      if (reportAllResult.quality.comparablesFound >= TARGET_COMPARABLES) {
        console.log(`[Airbtics] Using report/all result: ${reportAllResult.quality.comparablesFound} comps found`);
        return reportAllResult;
      }
      console.log(`[Airbtics] report/all only found ${reportAllResult.quality.comparablesFound}/${TARGET_COMPARABLES} comps - trying bounds expansion`);
    } else {
      console.log('[Airbtics] report/all returned null (credits exhausted or failed)');
    }
  } catch (err) {
    console.log('[Airbtics] report/all failed:', err);
  }

  // ── SECONDARY: Try bounds-based progressive radius expansion ──
  // This runs when report/all found < 12 comps OR failed entirely.
  // Uses PMI-style radius steps (0.4km to 8km) until 12 comps found.
  try {
    const marketsResult = await getShortLetDataFromMarkets(postcode, bedrooms, guests, lat, lng, apiKey, options?.finishQuality);

    // Pick the better result between report/all and markets
    // Prefer whichever found more comparables
    if (reportAllResult && reportAllResult.quality.comparablesFound > marketsResult.quality.comparablesFound) {
      console.log(`[Airbtics] Keeping report/all result (${reportAllResult.quality.comparablesFound} > ${marketsResult.quality.comparablesFound} comps)`);
      return reportAllResult;
    }
    console.log(`[Airbtics] Using markets flow result: ${marketsResult.quality.comparablesFound} comps`);
    return marketsResult;
  } catch (err) {
    console.log('[Airbtics] markets fallback failed:', err);
  }

  // ── LAST RESORT: Return report/all result even with few comps ──
  if (reportAllResult) {
    console.log('[Airbtics] Returning report/all result as last resort');
    return reportAllResult;
  }

  // ── FINAL FALLBACK: generic estimate ──
  console.log('[Airbtics] All paths failed - using generic market estimate');
  return { data: generateMarketEstimate(bedrooms), quality: lowQuality };
}

// ─── report/all comp shape ─────────────────────────────────────
interface ReportComp {
  listingID: string;
  name: string;
  bedrooms: string | number; // API returns string
  bathrooms: number;
  accommodates: number;
  latitude: number;
  longitude: number;
  host_name: string;
  room_type: string;
  minimum_nights: number;
  visible_review_count: number;
  reveiw_scores_rating: number; // API typo, 0-5 scale
  amenities: Record<string, boolean>;
  annual_revenue_ltm: number;
  avg_occupancy_rate_ltm: number; // 0-100
  avg_booked_daily_rate_ltm: number;
  active_days_count_ltm: number;
  no_of_bookings_ltm: number;
  revenue_ltm_monthly: Record<string, number>; // "YYYY-MM" → revenue
  booked_daily_rate_ltm_monthly: Record<string, number>;
  occupancy_rate_ltm_monthly: Record<string, number>;
}

interface ReportAllResult {
  id: string;
  latitude: number;
  longitude: number;
  bedrooms: number;
  bathrooms: number;
  accommodates: number;
  radius: number;
  comps_status: string;
  comps: ReportComp[];
}

/**
 * Two-step report/all flow:
 * 1. POST to create report → report_id
 * 2. Poll GET until comps_status === "success"
 * Cost: $0.50 for POST, GET is free.
 */
async function fetchReportAll(
  lat: number,
  lng: number,
  bedrooms: number,
  guests: number,
  apiKey: string,
  postcode: string,
  formBathrooms?: number,
): Promise<ReportAllResult | null> {
  const accommodates = guests;
  const bathrooms = formBathrooms ?? Math.max(1, Math.ceil(bedrooms * 0.75));

  // Check cache first — reading existing reports is FREE
  const cacheKey = `${postcode.replace(/\s+/g, '').toUpperCase()}_${bedrooms}bed`;
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`Airbtics report/all: using cached report ${cached.reportId} (FREE)`);
    const cachedResult = await readReport(cached.reportId, apiKey);
    if (cachedResult) return cachedResult;
    // Cache miss (report deleted?) — fall through to create new one
  }

  // Step 1: Create report ($0.50)
  const reportBody = {
    latitude: lat,
    longitude: lng,
    bedrooms,
    bathrooms,
    accommodates,
    currency: 'GBP',
    country_code: 'GB',
  };
  console.log('[DEBUG] report/all POST body:', JSON.stringify(reportBody));

  const createRes = await fetch(`${BASE_URL}/report/all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(reportBody),
    cache: 'no-store',
  });

  console.log(`[DEBUG] report/all HTTP status: ${createRes.status}`);

  if (!createRes.ok) {
    console.error(`[DEBUG] Airbtics report/all POST failed HTTP ${createRes.status}`);
    return null;
  }

  const createData = await createRes.json();
  console.log('[DEBUG] report/all raw response:', JSON.stringify(createData).slice(0, 2000));

  if (createData.message === 'insufficient_credits') {
    console.log('[DEBUG] Airbtics: insufficient_credits for report/all — NO data returned');
    return null;
  }

  const reportId = createData?.message?.report_id;
  if (!reportId) {
    console.error('[DEBUG] Airbtics report/all: no report_id in response', createData);
    return null;
  }

  console.log(`Airbtics report/all: created report ${reportId}, polling...`);

  // Cache the report ID for 24h — future reads are FREE
  reportCache.set(cacheKey, { reportId, expiresAt: Date.now() + REPORT_CACHE_TTL_MS });

  // Step 2: Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < REPORT_POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, REPORT_POLL_INTERVAL_MS));

    const readRes = await fetch(`${BASE_URL}/report?id=${reportId}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    });

    if (!readRes.ok) {
      console.error(`Airbtics report GET returned HTTP ${readRes.status}`);
      continue;
    }

    const readData = await readRes.json();
    console.log('[DEBUG] report/read raw response:', JSON.stringify(readData).slice(0, 1500));
    const report = readData?.message ?? readData;

    if ((report?.comps_status === 'success' || (Array.isArray(report?.comps) && report.comps.length > 0)) && Array.isArray(report.comps)) {
      console.log(`[DEBUG] report/all SUCCESS: comps_status="${report?.comps_status}", comps_count=${report.comps.length}`);
      if (report.comps.length > 0) {
        console.log('[DEBUG] First comp fields:', Object.keys(report.comps[0]).join(','));
      }
      return report as ReportAllResult;
    }

    console.log(`[DEBUG] report/all: comps_status="${report?.comps_status}", comps_length=${Array.isArray(report?.comps) ? report.comps.length : 'N/A'}, retrying...`);
  }

  console.error('[DEBUG] Airbtics report/all: TIMED OUT waiting for comps');
  return null;
}

/**
 * Reads an existing report by ID (FREE — no credit cost).
 */
async function readReport(reportId: string, apiKey: string): Promise<ReportAllResult | null> {
  const res = await fetch(`${BASE_URL}/report?id=${reportId}`, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();
  const report = data?.message ?? data;
  if ((report?.comps_status === 'success' || (Array.isArray(report?.comps) && report.comps.length > 0)) && Array.isArray(report.comps)) {
    return report as ReportAllResult;
  }
  return null;
}

/**
 * Calculates the median of an array of numbers.
 */
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Finish quality multipliers applied after median calculation. */
const FINISH_MULTIPLIERS: Record<string, number> = {
  'below_average': 0.75,
  'average': 1.0,
  'high': 1.15,
  'very_high': 1.30,
};

/** Days in each calendar month (non-leap year). */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Builds ShortLetData + DataQuality from report/all comps.
 * Filters by guest capacity (within +/-2 of user's guest count),
 * uses MEDIAN stats across all filtered comps, then applies finish quality multiplier.
 */
function buildDataFromReportComps(
  report: ReportAllResult,
  bedrooms: number,
  guests: number,
  lat: number,
  lng: number,
  hasParking?: boolean,
  finishQuality?: string,
): { data: ShortLetData; quality: DataQuality } {
  // Filter comps: match by guest capacity (within +/-2), filter bad operators
  const filtered = report.comps.filter((c) => {
    const hasRevenue = (c.annual_revenue_ltm ?? 0) > 0;
    const guestMatch = Math.abs((c.accommodates ?? 0) - guests) <= 2;
    return guestMatch && hasRevenue;
  });

  // Sort by distance (closest first) for comparable selection
  filtered.sort((a, b) => {
    const distA = haversineKm(lat, lng, a.latitude, a.longitude);
    const distB = haversineKm(lat, lng, b.latitude, b.longitude);
    return distA - distB;
  });

  // When hasParking is true, prefer comps with parking — sort parking comps first
  if (hasParking) {
    const compHasParking = (c: ReportComp): boolean => {
      if (!c.amenities) return false;
      return !!(c.amenities.parking || c.amenities.free_parking || c.amenities['Free parking on premises'] || c.amenities['free_parking_on_premises']);
    };
    filtered.sort((a, b) => {
      const aParking = compHasParking(a) ? 1 : 0;
      const bParking = compHasParking(b) ? 1 : 0;
      if (bParking !== aParking) return bParking - aParking;
      // Preserve distance ordering within same parking tier
      const distA = haversineKm(lat, lng, a.latitude, a.longitude);
      const distB = haversineKm(lat, lng, b.latitude, b.longitude);
      return distA - distB;
    });
  }
  const top12 = filtered.slice(0, TARGET_COMPARABLES);

  // Convert to ShortLetComparable[]
  const comparables: ShortLetComparable[] = top12.map((c): ShortLetComparable => {
    const distance = haversineKm(lat, lng, c.latitude, c.longitude);
    return {
      title: c.name || 'Airbnb Listing',
      url: `https://www.airbnb.co.uk/rooms/${c.listingID}`,
      bedrooms: typeof c.bedrooms === 'string' ? parseInt(c.bedrooms, 10) : (c.bedrooms ?? 0),
      accommodates: c.accommodates ?? 0,
      averageDailyRate: Math.round(c.avg_booked_daily_rate_ltm ?? 0),
      occupancyRate: Math.round(c.avg_occupancy_rate_ltm ?? 0) / 100,
      annualRevenue: Math.round(c.annual_revenue_ltm ?? 0),
      distance,
      rating: Math.floor((c.reveiw_scores_rating ?? 0) * 10) / 10, // Always round DOWN (4.66 -> 4.6)
      reviewCount: c.visible_review_count ?? 0,
      listingAge: 0, // report/all doesn't include added_on
      daysAvailable: c.active_days_count_ltm ?? 0,
    };
  });

  // ── Headline stats: MEDIAN across ALL filtered comps, then finish quality multiplier ──
  let annualRevenue: number;
  let avgOccupancy: number;
  let derivedAdr: number;
  let monthlyRevenue: number[];

  if (filtered.length > 0) {
    const medianADR = calculateMedian(filtered.map(c => c.avg_booked_daily_rate_ltm ?? 0));
    const medianOccupancy = calculateMedian(filtered.map(c => (c.avg_occupancy_rate_ltm ?? 0) / 100));

    // Build seasonal multipliers from real monthly data if available
    const seasonalADRMultiplier = buildSeasonalMultipliers(filtered, 'booked_daily_rate_ltm_monthly');
    const seasonalOccMultiplier = buildSeasonalMultipliers(filtered, 'occupancy_rate_ltm_monthly');

    // Monthly revenue = medianADR * adrMultiplier * medianOccupancy * occMultiplier * daysInMonth
    monthlyRevenue = DAYS_IN_MONTH.map((days, i) =>
      Math.round(medianADR * seasonalADRMultiplier[i] * medianOccupancy * seasonalOccMultiplier[i] * days),
    );

    // Apply finish quality multiplier
    const multiplier = FINISH_MULTIPLIERS[finishQuality || 'high'] ?? 1.15;
    monthlyRevenue = monthlyRevenue.map(m => Math.round(m * multiplier));
    annualRevenue = monthlyRevenue.reduce((s, m) => s + m, 0);
    derivedAdr = Math.round(medianADR * multiplier);
    avgOccupancy = Math.round(medianOccupancy * 100) / 100;
  } else {
    // No comps matched filters - use estimate
    const estimate = generateMarketEstimate(bedrooms);
    return {
      data: estimate,
      quality: {
        comparablesFound: 0,
        comparablesTarget: TARGET_COMPARABLES,
        searchRadiusKm: report.radius ? report.radius / 1000 : 0,
        searchBroadened: false,
        level: 'low',
        disclaimer: `No comparable properties accommodating ~${guests} guests were found in the report. Market-level estimates have been used. Book a web meeting with Stayful for accurate, personalised revenue projections.`,
      },
    };
  }

  const activeListings = filtered.length;
  const searchRadiusKm = report.radius ? Math.round(report.radius / 1000 * 100) / 100 : 0;

  // ── Data quality ──
  const comparablesFound = comparables.length;
  let qualityLevel: DataQuality['level'];
  let disclaimer: string | null = null;

  if (comparablesFound >= TARGET_COMPARABLES) {
    qualityLevel = 'high';
  } else if (comparablesFound >= 6) {
    qualityLevel = 'moderate';
    disclaimer = `${comparablesFound} comparable properties (accommodating ~${guests} guests) were found within ${searchRadiusKm}km. Data accuracy may be slightly reduced. This could indicate a unique property type for the area, which is often advantageous for short-term letting.`;
  } else {
    qualityLevel = 'low';
    disclaimer = comparablesFound > 0
      ? `Only ${comparablesFound} comparable properties (accommodating ~${guests} guests) were found within ${searchRadiusKm}km. This area may be rural or the property type may be unique, both of which can be highly advantageous for short-term letting as competition is low. We recommend booking a web meeting with Stayful for a more detailed, personalised assessment.`
      : `No comparable properties accommodating ~${guests} guests were found. Market-level estimates have been used. Book a web meeting with Stayful for accurate, personalised revenue projections.`;
  }

  return {
    data: {
      annualRevenue: Math.round(annualRevenue),
      monthlyRevenue: padTo12Months(monthlyRevenue),
      occupancyRate: Math.round(avgOccupancy * 100) / 100,
      averageDailyRate: derivedAdr,
      activeListings,
      comparables,
    },
    quality: {
      comparablesFound,
      comparablesTarget: TARGET_COMPARABLES,
      searchRadiusKm,
      searchBroadened: false,
      level: qualityLevel,
      disclaimer,
    },
  };
}

/**
 * Extracts real monthly revenue from comps' revenue_ltm_monthly fields.
 * Averages across comps, maps "YYYY-MM" keys to calendar months (Jan=0..Dec=11).
 * Returns exactly 12 values in Jan..Dec order.
 */
function extractMonthlyFromComps(comps: ReportComp[]): number[] {
  // Collect all monthly data per calendar month (0=Jan .. 11=Dec)
  const monthTotals: number[] = new Array(12).fill(0);
  const monthCounts: number[] = new Array(12).fill(0);

  for (const comp of comps) {
    if (!comp.revenue_ltm_monthly) continue;
    for (const [key, value] of Object.entries(comp.revenue_ltm_monthly)) {
      // key is "YYYY-MM"
      const monthPart = key.split('-')[1];
      if (!monthPart) continue;
      const monthIndex = parseInt(monthPart, 10) - 1; // "01" → 0 (Jan)
      if (monthIndex >= 0 && monthIndex < 12 && typeof value === 'number') {
        monthTotals[monthIndex] += value;
        monthCounts[monthIndex]++;
      }
    }
  }

  // Average each month
  return monthTotals.map((total, i) =>
    monthCounts[i] > 0 ? Math.round(total / monthCounts[i]) : 0,
  );
}

/**
 * Builds seasonal multipliers from comp monthly data.
 * multiplier[month] = monthAverage / annualAverage
 * Falls back to typical UK seasonal pattern if no real data.
 */
function buildSeasonalMultipliers(
  comps: ReportComp[],
  monthlyField: 'booked_daily_rate_ltm_monthly' | 'occupancy_rate_ltm_monthly',
): number[] {
  const monthTotals: number[] = new Array(12).fill(0);
  const monthCounts: number[] = new Array(12).fill(0);

  for (const comp of comps) {
    const monthlyData = comp[monthlyField];
    if (!monthlyData) continue;
    for (const [key, value] of Object.entries(monthlyData)) {
      const monthPart = key.split('-')[1];
      if (!monthPart) continue;
      const monthIndex = parseInt(monthPart, 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12 && typeof value === 'number' && value > 0) {
        monthTotals[monthIndex] += value;
        monthCounts[monthIndex]++;
      }
    }
  }

  const monthAverages = monthTotals.map((total, i) =>
    monthCounts[i] > 0 ? total / monthCounts[i] : 0,
  );

  const validMonths = monthAverages.filter(v => v > 0);
  if (validMonths.length < 6) {
    // Not enough real data, use default UK seasonal pattern
    return [0.82, 0.85, 0.95, 1.00, 1.08, 1.18, 1.25, 1.22, 1.10, 0.98, 0.88, 0.80];
  }

  const annualAverage = validMonths.reduce((s, v) => s + v, 0) / validMonths.length;
  return monthAverages.map(v => v > 0 ? v / annualAverage : 1.0);
}

/**
 * FALLBACK: Original markets/summary + metrics + bounds flow.
 * Used when report/all fails or returns no data.
 */
async function getShortLetDataFromMarkets(
  postcode: string,
  bedrooms: number,
  guests: number,
  lat: number,
  lng: number,
  apiKey: string,
  finishQuality?: string,
): Promise<{ data: ShortLetData; quality: DataQuality }> {
  const lowQuality: DataQuality = {
    comparablesFound: 0, comparablesTarget: TARGET_COMPARABLES,
    searchRadiusKm: 0, searchBroadened: false, level: 'low',
    disclaimer: 'Limited data available for this area. This property may be in a unique or rural location, which can be advantageous for short-term letting. Book a web meeting with Stayful for a more detailed, personalised assessment.',
  };

  // Step 1: Find market ID from postcode area (cached)
  const marketId = await findMarketId(postcode, apiKey);
  if (!marketId) {
    console.log('Airbtics: no market found for postcode, using estimates');
    return { data: generateMarketEstimate(bedrooms), quality: lowQuality };
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

  // Check if summary has real data (not null values)
  const summaryHasData = summary && summary.revenue != null && summary.revenue > 0;

  // If no monthly data AND no useful summary, fall back to estimates
  if (revenue.length === 0 && !summaryHasData) {
    console.log('Airbtics: no data available, using market estimates');
    return { data: generateMarketEstimate(bedrooms), quality: lowQuality };
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

  // Apply finish quality multiplier (same as report/all path)
  const qualityMultiplier = FINISH_MULTIPLIERS[finishQuality || 'high'] ?? 1.15;

  // Apply guest-count adjustment: market data is for median guest count (~4)
  // Larger properties (more guests) command proportionally more revenue
  // Scale linearly: +12% per guest above 4 (capped at 1.5x for 8+ guests)
  const guestAdjustment = Math.min(1 + (Math.max(0, guests - 4) * 0.12), 1.5);

  const rawRevenue = summaryRevenue || monthlyRevenue.reduce((a, b) => a + b, 0);
  let annualRevenue = Math.round(rawRevenue * qualityMultiplier * guestAdjustment);
  let derivedAdr = Math.round((summaryAdr || Math.round(rawRevenue / 12 / ((avgOccupancy || 0.65) * 30))) * qualityMultiplier * guestAdjustment);

  monthlyRevenue = monthlyRevenue.map(m => Math.round(m * qualityMultiplier * guestAdjustment));

  // ── Rule of 12: Try to find 12 comparables, broadening search if needed ──
  let comparables: ShortLetComparable[] = [];
  let activeListings = 0;
  let searchRadiusKm = SEARCH_RADII_KM[0];
  let searchBroadened = false;

  // First attempt uses the initial bounds result
  if (listingsResult) {
    const result = extractComparables(listingsResult, guests, lat, lng);
    comparables = result.comparables;
    activeListings = result.totalMatches;
  }

  // If we have fewer than 12, try broader radii (PMI progressive expansion)
  if (comparables.length < TARGET_COMPARABLES) {
    for (let i = 1; i < SEARCH_RADII_KM.length; i++) {
      const radiusKm = SEARCH_RADII_KM[i];
      console.log(`Airbtics: only ${comparables.length}/${TARGET_COMPARABLES} comparables, broadening to ${radiusKm}km`);
      searchBroadened = true;
      searchRadiusKm = radiusKm;

      const broaderResult = await fetchNearbyListings(lat, lng, apiKey, radiusKm);
      if (broaderResult) {
        const result = extractComparables(broaderResult, guests, lat, lng);
        comparables = result.comparables;
        activeListings = result.totalMatches;
        if (comparables.length >= TARGET_COMPARABLES) break;
      }
    }
  } else {
    searchRadiusKm = SEARCH_RADII_KM[0];
  }

  // Cap at 12 comparables
  comparables = comparables.slice(0, TARGET_COMPARABLES);

  // Use summary active_listings_count as fallback
  if (activeListings === 0 && summary?.active_listings_count) {
    activeListings = summary.active_listings_count;
  }

  // ── Top-5 performer override ──
  if (comparables.length >= 5) {
    const sorted = [...comparables].sort((a, b) => b.annualRevenue - a.annualRevenue);
    const top5 = sorted.slice(0, 5);
    const top5Revenue = Math.round(top5.reduce((s, c) => s + c.annualRevenue, 0) / 5);
    const top5Adr = Math.round(top5.reduce((s, c) => s + c.averageDailyRate, 0) / 5);
    const top5Occupancy = top5.reduce((s, c) => s + c.occupancyRate, 0) / 5;

    const ratio = top5Revenue / (annualRevenue || 1);
    monthlyRevenue = monthlyRevenue.map((m) => Math.round(m * ratio));

    annualRevenue = top5Revenue;
    avgOccupancy = top5Occupancy;
    derivedAdr = top5Adr;
  }

  // ── Build data quality assessment ──
  const comparablesFound = comparables.length;
  let qualityLevel: DataQuality['level'];
  let disclaimer: string | null = null;

  if (comparablesFound >= TARGET_COMPARABLES) {
    qualityLevel = 'high';
  } else if (comparablesFound >= 6) {
    qualityLevel = 'moderate';
    disclaimer = `${comparablesFound} comparable properties (accommodating ~${guests} guests) were found within ${searchRadiusKm}km after expanding the search. Data accuracy may be slightly reduced. This could indicate a unique property type for the area, which is often advantageous for short-term letting.`;
  } else if (comparablesFound > 0) {
    qualityLevel = 'low';
    disclaimer = `Only ${comparablesFound} comparable properties (accommodating ~${guests} guests) were found even after broadening the search to ${searchRadiusKm}km. This area may be rural or the property type may be unique, both of which can be advantageous for short-term letting due to low competition. Book a web meeting with Stayful for a detailed, personalised assessment.`;
  } else {
    qualityLevel = 'low';
    disclaimer = `Projections are based on ${bedrooms}-bedroom market median data for the area, adjusted for guest capacity and property specification. Real-time comparable listings were not available during this lookup. Book a web meeting with Stayful for accurate, personalised revenue projections based on your specific location.`;
  }

  const quality: DataQuality = {
    comparablesFound,
    comparablesTarget: TARGET_COMPARABLES,
    searchRadiusKm,
    searchBroadened,
    level: qualityLevel,
    disclaimer,
  };

  const paddedRevenue = padTo12Months(monthlyRevenue);

  return {
    data: {
      annualRevenue: Math.round(annualRevenue),
      monthlyRevenue: paddedRevenue,
      occupancyRate: Math.round(avgOccupancy * 100) / 100,
      averageDailyRate: derivedAdr,
      activeListings,
      comparables,
    },
    quality,
  };
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
 * Extracts and sorts comparables from a bounds search result.
 */
function extractComparables(
  result: BoundsResponse,
  guests: number,
  lat: number,
  lng: number,
): { comparables: ShortLetComparable[]; totalMatches: number } {
  // Filter by GUESTS (PMI behaviour) not bedrooms
  // Allow ±2 guest flexibility to find similar-sized properties
  const guestMatches = result.listings.filter(
    (l: AirbticsListing) =>
      Math.abs((l.accommodates ?? 0) - guests) <= 2 &&
      (l.annual_revenue_ltm ?? 0) > 0, // Filter zero-revenue listings
  );

  const withDistance = guestMatches.map((l: AirbticsListing) => ({
    ...l,
    distance: haversineKm(lat, lng, l.latitude, l.longitude),
  }));
  withDistance.sort((a, b) => a.distance - b.distance);

  const comparables = withDistance.slice(0, TARGET_COMPARABLES).map((l): ShortLetComparable => {
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
      rating: Math.floor(((l.reveiw_scores_rating ?? 0) / 20) * 10) / 10, // Always round DOWN
      reviewCount: l.visible_review_count ?? 0,
      listingAge: ageYears,
      daysAvailable: l.active_days_count_ltm ?? 0,
    };
  });

  return { comparables, totalMatches: guestMatches.length };
}

/**
 * Fetches nearby listings within a bounding box using the bounds endpoint.
 * Cost: $0.05/call
 */
async function fetchNearbyListings(
  lat: number,
  lng: number,
  apiKey: string,
  radiusKm: number = 1.5,
): Promise<BoundsResponse | null> {
  // At UK latitudes (~52-55°N), 1° lat ≈ 111km, 1° lng ≈ 65km
  const latOffset = radiusKm / 111;
  const lngOffset = radiusKm / 65;

  const body = {
    bounds: {
      ne_lat: lat + latOffset,
      ne_lng: lng + lngOffset,
      sw_lat: lat - latOffset,
      sw_lng: lng - lngOffset,
    },
    currency: 'GBP',
  };

  const radiusMetres = Math.round(radiusKm * 1000);
  console.log(`[DEBUG] listings/search/bounds radius: ${radiusKm}km (${radiusMetres}m)`);
  console.log('[DEBUG] listings/search/bounds body:', JSON.stringify(body));

  const response = await fetch(`${BASE_URL}/listings/search/bounds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  console.log(`[DEBUG] listings/search/bounds HTTP status: ${response.status}`);

  if (!response.ok) {
    console.error(`[DEBUG] Airbtics bounds search failed HTTP ${response.status}`);
    return null;
  }

  const data = await response.json();
  console.log('[DEBUG] Airbtics raw response:', JSON.stringify(data).slice(0, 2000));

  if (data.message === 'insufficient_credits') {
    console.log('[DEBUG] Airbtics: insufficient_credits for listings/search/bounds — returning null');
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
      console.error('[DEBUG] Airbtics: failed to parse listings JSON:', e);
    }
  }

  console.log(`[DEBUG] Listings found: ${listings.length} (total_count: ${totalCount}, radius: ${radiusMetres}m)`);
  if (listings.length > 0) {
    console.log('[DEBUG] First listing fields:', Object.keys(listings[0]).join(','));
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

  console.log(`[DEBUG] markets/summary URL: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  });

  console.log(`[DEBUG] markets/summary HTTP status: ${response.status}`);
  if (!response.ok) return null;

  const data = await response.json();
  console.log('[DEBUG] Market summary raw:', JSON.stringify(data).slice(0, 1000));

  if (data.message === 'insufficient_credits' || typeof data.message !== 'object') {
    console.log(`[DEBUG] markets/summary rejected: ${JSON.stringify(data.message)}`);
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
    cache: 'no-store',
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

  console.log(`[DEBUG] markets/metrics/${metric} URL: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  });

  console.log(`[DEBUG] markets/metrics/${metric} HTTP status: ${response.status}`);

  if (!response.ok) return [];

  const data = await response.json();
  console.log(`[DEBUG] Market monthly (${metric}) raw:`, JSON.stringify(data).slice(0, 1000));

  if (data.message === 'insufficient_credits') {
    console.log(`[DEBUG] markets/metrics/${metric}: insufficient_credits`);
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
