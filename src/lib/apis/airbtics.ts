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
const SEARCH_RADII_KM = [1.5, 3, 5, 10]; // Progressively broaden
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
  _guests: number,
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
  try {
    const reportResult = await fetchReportAll(lat, lng, bedrooms, apiKey, postcode, options?.bathrooms);
    if (reportResult) {
      console.log(`Airbtics report/all: ${reportResult.comps.length} raw comps returned`);
      return buildDataFromReportComps(reportResult, bedrooms, lat, lng, options?.hasParking, options?.finishQuality);
    }
    console.log('Airbtics report/all: no data, falling back to markets flow');
  } catch (err) {
    console.log('Airbtics report/all failed, falling back to markets flow:', err);
  }

  // ── FALLBACK: markets/summary + metrics + bounds (~$0.46) ──
  try {
    return await getShortLetDataFromMarkets(postcode, bedrooms, lat, lng, apiKey);
  } catch (err) {
    console.log('Airbtics markets fallback also failed, using estimates:', err);
    return { data: generateMarketEstimate(bedrooms), quality: lowQuality };
  }
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
  apiKey: string,
  postcode: string,
  formBathrooms?: number,
): Promise<ReportAllResult | null> {
  const accommodates = (bedrooms * 2) + 2;
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
  const createRes = await fetch(`${BASE_URL}/report/all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      latitude: lat,
      longitude: lng,
      bedrooms,
      bathrooms,
      accommodates,
      currency: 'GBP',
      country_code: 'GB',
    }),
  });

  if (!createRes.ok) {
    console.error(`Airbtics report/all POST returned HTTP ${createRes.status}`);
    return null;
  }

  const createData = await createRes.json();
  if (createData.message === 'insufficient_credits') {
    console.log('Airbtics: insufficient credits for report/all');
    return null;
  }

  const reportId = createData?.message?.report_id;
  if (!reportId) {
    console.error('Airbtics report/all: no report_id in response', createData);
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
    });

    if (!readRes.ok) {
      console.error(`Airbtics report GET returned HTTP ${readRes.status}`);
      continue;
    }

    const readData = await readRes.json();
    const report = readData?.message ?? readData;

    if ((report?.comps_status === 'success' || (Array.isArray(report?.comps) && report.comps.length > 0)) && Array.isArray(report.comps)) {
      return report as ReportAllResult;
    }

    console.log(`Airbtics report/all: comps_status="${report?.comps_status}", retrying...`);
  }

  console.error('Airbtics report/all: timed out waiting for comps_status=success');
  return null;
}

/**
 * Reads an existing report by ID (FREE — no credit cost).
 */
async function readReport(reportId: string, apiKey: string): Promise<ReportAllResult | null> {
  const res = await fetch(`${BASE_URL}/report?id=${reportId}`, {
    headers: { 'x-api-key': apiKey },
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
 * Builds ShortLetData + DataQuality from report/all comps.
 * Filters by accommodates >= bedrooms * 2, takes top 12 by revenue,
 * uses top 5 performers for headline stats, and extracts real monthly data.
 */
function buildDataFromReportComps(
  report: ReportAllResult,
  bedrooms: number,
  lat: number,
  lng: number,
  hasParking?: boolean,
  finishQuality?: string,
): { data: ShortLetData; quality: DataQuality } {
  // Filter comps: match bedrooms, filter bad operators, handle non-numeric bedrooms
  const filtered = report.comps.filter((c) => {
    const compBeds = typeof c.bedrooms === 'string' ? parseInt(c.bedrooms, 10) : (c.bedrooms ?? 0);
    if (isNaN(compBeds)) return false; // Skip "Studio" etc.
    const bedroomMatch = compBeds === bedrooms;
    const hasRevenue = (c.annual_revenue_ltm ?? 0) > 0;
    const hasReasonableCapacity = c.accommodates >= Math.max(bedrooms, 2);
    return bedroomMatch && hasRevenue && hasReasonableCapacity;
  });

  // Sort by annual revenue descending
  filtered.sort((a, b) => (b.annual_revenue_ltm ?? 0) - (a.annual_revenue_ltm ?? 0));

  // When hasParking is true, prefer comps with parking — sort parking comps first
  // within the same revenue tier. Use a stable sort: parking comps first, then non-parking.
  if (hasParking) {
    const compHasParking = (c: ReportComp): boolean => {
      if (!c.amenities) return false;
      return !!(c.amenities.parking || c.amenities.free_parking || c.amenities['Free parking on premises'] || c.amenities['free_parking_on_premises']);
    };
    filtered.sort((a, b) => {
      const aParking = compHasParking(a) ? 1 : 0;
      const bParking = compHasParking(b) ? 1 : 0;
      if (bParking !== aParking) return bParking - aParking;
      return (b.annual_revenue_ltm ?? 0) - (a.annual_revenue_ltm ?? 0);
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
      rating: Math.round((c.reveiw_scores_rating ?? 0) * 10) / 10, // Already 0-5 scale
      reviewCount: c.visible_review_count ?? 0,
      listingAge: 0, // report/all doesn't include added_on
      daysAvailable: c.active_days_count_ltm ?? 0,
    };
  });

  // ── Headline stats: adjust based on finish quality ──
  // filtered is sorted descending by revenue
  // very_high: top 3 (best performers, luxury spec achieves top results)
  // high: upper 40% (good operators like Stayful)
  // average: middle of the pack (median)
  // below_average: bottom 3 average (poor spec = lower end performance)
  let upperQuartile: typeof filtered;
  const n = filtered.length;

  if (finishQuality === 'very_high' && n >= 3) {
    upperQuartile = filtered.slice(0, 3);
  } else if (finishQuality === 'below_average' && n >= 3) {
    upperQuartile = filtered.slice(-3); // bottom 3
  } else if (finishQuality === 'average') {
    // Middle third
    const start = Math.floor(n * 0.33);
    const end = Math.ceil(n * 0.67);
    upperQuartile = filtered.slice(start, Math.max(end, start + 3));
  } else {
    // 'high' or default: upper 40%
    const upperCount = Math.max(3, Math.ceil(n * 0.4));
    upperQuartile = filtered.slice(0, upperCount);
  }

  let annualRevenue: number;
  let avgOccupancy: number;
  let derivedAdr: number;
  let monthlyRevenue: number[];

  if (upperQuartile.length > 0) {
    const n = upperQuartile.length;
    annualRevenue = Math.round(upperQuartile.reduce((s, c) => s + (c.annual_revenue_ltm ?? 0), 0) / n);
    derivedAdr = Math.round(upperQuartile.reduce((s, c) => s + (c.avg_booked_daily_rate_ltm ?? 0), 0) / n);
    avgOccupancy = upperQuartile.reduce((s, c) => s + (c.avg_occupancy_rate_ltm ?? 0), 0) / n / 100;
    monthlyRevenue = extractMonthlyFromComps(upperQuartile);
  } else if (filtered.length > 0) {
    const n = filtered.length;
    annualRevenue = Math.round(filtered.reduce((s, c) => s + (c.annual_revenue_ltm ?? 0), 0) / n);
    derivedAdr = Math.round(filtered.reduce((s, c) => s + (c.avg_booked_daily_rate_ltm ?? 0), 0) / n);
    avgOccupancy = filtered.reduce((s, c) => s + (c.avg_occupancy_rate_ltm ?? 0), 0) / n / 100;
    monthlyRevenue = extractMonthlyFromComps(filtered);
  } else {
    // No comps matched filters — use estimate
    const estimate = generateMarketEstimate(bedrooms);
    return {
      data: estimate,
      quality: {
        comparablesFound: 0,
        comparablesTarget: TARGET_COMPARABLES,
        searchRadiusKm: report.radius ? report.radius / 1000 : 0,
        searchBroadened: false,
        level: 'low',
        disclaimer: `No comparable ${bedrooms}-bedroom properties were found in the report. Market-level estimates have been used. Book a web meeting with Stayful for accurate, personalised revenue projections.`,
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
    disclaimer = `${comparablesFound} comparable ${bedrooms}-bedroom properties were found within ${searchRadiusKm}km. Data accuracy may be slightly reduced. This could indicate a unique property type for the area — uniqueness is often advantageous for short-term letting.`;
  } else {
    qualityLevel = 'low';
    disclaimer = comparablesFound > 0
      ? `Only ${comparablesFound} comparable ${bedrooms}-bedroom properties were found within ${searchRadiusKm}km. This area may be rural or the property type may be unique — both can be highly advantageous for short-term letting as competition is low. We recommend booking a web meeting with Stayful for a more detailed, personalised assessment.`
      : `No comparable ${bedrooms}-bedroom properties were found. Market-level estimates have been used. Book a web meeting with Stayful for accurate, personalised revenue projections.`;
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
 * FALLBACK: Original markets/summary + metrics + bounds flow.
 * Used when report/all fails or returns no data.
 */
async function getShortLetDataFromMarkets(
  postcode: string,
  bedrooms: number,
  lat: number,
  lng: number,
  apiKey: string,
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

  // Apply "good operator" uplift — market data represents median (p50) which includes
  // bad operators. Stayful consistently performs at p60-p65, roughly 25% above median.
  const rawRevenue = summaryRevenue || monthlyRevenue.reduce((a, b) => a + b, 0);
  let annualRevenue = Math.round(rawRevenue * GOOD_OPERATOR_UPLIFT);
  let derivedAdr = Math.round((summaryAdr || Math.round(rawRevenue / 12 / ((avgOccupancy || 0.65) * 30))) * GOOD_OPERATOR_UPLIFT);

  // Also uplift monthly figures
  monthlyRevenue = monthlyRevenue.map(m => Math.round(m * GOOD_OPERATOR_UPLIFT));

  // ── Rule of 12: Try to find 12 comparables, broadening search if needed ──
  let comparables: ShortLetComparable[] = [];
  let activeListings = 0;
  let searchRadiusKm = SEARCH_RADII_KM[0];
  let searchBroadened = false;

  // First attempt uses the initial bounds result
  if (listingsResult) {
    const result = extractComparables(listingsResult, bedrooms, lat, lng);
    comparables = result.comparables;
    activeListings = result.totalMatches;
  }

  // If we have fewer than 12, try broader radii
  if (comparables.length < TARGET_COMPARABLES) {
    for (let i = 1; i < SEARCH_RADII_KM.length; i++) {
      const radiusKm = SEARCH_RADII_KM[i];
      console.log(`Airbtics: only ${comparables.length}/${TARGET_COMPARABLES} comparables, broadening to ${radiusKm}km`);
      searchBroadened = true;
      searchRadiusKm = radiusKm;

      const broaderResult = await fetchNearbyListings(lat, lng, apiKey, radiusKm);
      if (broaderResult) {
        const result = extractComparables(broaderResult, bedrooms, lat, lng);
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
    disclaimer = `Only ${comparablesFound} comparable ${bedrooms}-bedroom properties were found within ${searchRadiusKm}km. Data accuracy may be slightly reduced. This could indicate a unique property type for the area — uniqueness is often advantageous for short-term letting.`;
  } else {
    qualityLevel = 'low';
    disclaimer = comparablesFound > 0
      ? `Only ${comparablesFound} comparable ${bedrooms}-bedroom properties were found even after broadening the search to ${searchRadiusKm}km. This area may be rural or the property type may be unique — both can be highly advantageous for short-term letting as competition is low. We recommend booking a web meeting with Stayful for a more detailed, personalised assessment.`
      : `No comparable ${bedrooms}-bedroom properties were found nearby. This is a strong indicator of either a rural location or a highly unique property — both can perform exceptionally well for short-term letting due to low competition. Market-level estimates have been used. Book a web meeting with Stayful for accurate, personalised revenue projections.`;
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
  bedrooms: number,
  lat: number,
  lng: number,
): { comparables: ShortLetComparable[]; totalMatches: number } {
  const bedroomMatches = result.listings.filter(
    (l: AirbticsListing) =>
      l.bedrooms === bedrooms &&
      l.accommodates >= bedrooms * 2, // Filter out bad operators (e.g. 3-bed listing only accommodating 3 guests)
  );

  const withDistance = bedroomMatches.map((l: AirbticsListing) => ({
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
      rating: Math.round(((l.reveiw_scores_rating ?? 0) / 20) * 10) / 10,
      reviewCount: l.visible_review_count ?? 0,
      listingAge: ageYears,
      daysAvailable: l.active_days_count_ltm ?? 0,
    };
  });

  return { comparables, totalMatches: bedroomMatches.length };
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
