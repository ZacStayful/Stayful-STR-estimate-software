/**
 * PMI-aligned calibration rules.
 *
 * All thresholds and tables used by the rewritten STR estimator live here so
 * they can be tuned without touching core logic. See
 * docs/PMI_ALGORITHM_REWRITE_PLAN.md for derivation of each value.
 *
 * Every constant in this file is derived from analysis of 33 PMI PDF reports
 * (see scripts/pmi-test-dataset.json). Change coefficients here — don't add
 * if/else branches in the core pipeline.
 */

// ─── Compressed-premium postcodes ──────────────────────────────────
// Cities where the comp pool has a compressed high-end cluster and plain
// median materially under-predicts vs PMI. Confirmed from dataset:
//   EH1 Edinburgh Old Town: median −20% vs PMI; top-8 mean within 5%.
//   OX1 Oxford city centre: median −19% vs PMI; top-8 mean within 2%.
//   BA1 Bath Royal Crescent/centre: median −9% vs PMI; top-8 mean within 4%.
//   EH2 Edinburgh New Town: inferred as similar market to EH1 (same tourist
//       corridor); not directly tested — conservative addition.
//
// Tested and deliberately NOT included (plain median works within 10%):
//   YO1 York central (−4%), CB1/CB2 Cambridge central (−3%),
//   SW11 London Battersea (+8%), EC1R London Clerkenwell (+12% — median
//   overshoots if anything; adding to this list would worsen accuracy),
//   M1 Manchester Northern Quarter, E1 London Aldgate.
export const COMPRESSED_PREMIUM_POSTCODES = new Set<string>([
  'EH1', 'EH2',
  'OX1',
  'BA1',
]);

// Number of comps to retain when using top-N mean for compressed-premium cases.
// Drops bottom 4 of 12, keeps top 8. Matches PMI fit within ±5% for the three
// confirmed compressed-premium samples.
export const TOP_N_FOR_COMPRESSED_PREMIUM = 8;

// ─── Subject-vs-pool adjustments ───────────────────────────────────

// Boost applied per extra bedroom the subject has above the comp-pool median
// (fires only when guests are at or above comp median guests; otherwise the
// under-spec rule below takes precedence).
//
// Derived from:
//   Nottingham NG1 4ET (bed_gap=+1, guest_gap=0): raw median undershoots by
//     −17%; boost of +15% closes to −5%.
//   Nottingham NG1 1GL (bed_gap=+1, guest_gap=0): raw median undershoots by
//     −20%; boost of +15% closes to −8%.
export const BED_GAP_BOOST_PER_BED = 0.15;

// Trigger point for subject-is-under-spec'd adjustment. If subject guests is
// at least this much below comp median guests, shrink RevPAR by the damped
// ratio (see GUEST_GAP_SHRINK_DAMP below).
//
// Derived from Glasgow G12 (subject guests=3, comp median guests=4; gap=−1):
// raw median overshoots by +13%; straight-ratio shrink (0.75×) overshoots the
// other way, so the shrink is damped — see GUEST_GAP_SHRINK_DAMP.
export const GUEST_GAP_SHRINK_THRESHOLD = -1;

// Damping coefficient for the guest-gap shrink. The raw ratio
// subject.guests / comp.median_guests is pulled halfway back toward 1.0:
//   factor = 1 - DAMP × (1 - ratio)
// With DAMP = 0.5, Glasgow 3/4=0.75 → factor 0.875 (not 0.75).
// Derived from Glasgow: softened factor produces <2% error vs PMI.
export const GUEST_GAP_SHRINK_DAMP = 0.5;

// When to use mean instead of median for coastal markets. Coastal small
// properties (≤2 bed) have right-skewed RevPAR distributions (several very
// high performers + median baseline of typical performers); median under-
// predicts. Mean fits within 1% for Broadstairs 1-bed.
// Derived from Broadstairs CT10 1-bed/2-guest — median −13% vs PMI;
// mean within 0.2%.
export const COASTAL_SMALL_BED_THRESHOLD = 2;

// ─── Outlier filters ───────────────────────────────────────────────

// A comp is dropped before aggregation if its ADR is more than this
// multiple of the comp-pool median AND its revenue is more than the
// revenue multiple below. Both conditions must be met so we don't
// accidentally drop legitimate high-demand comps.
//
// Derived from:
//   Penrith 5-bed: comp #2 @ £884 ADR (vs pool median £289) inflated median
//     RevPAR by ~14%; dropping it brings prediction within 3%.
//   London EC1R: comp #1 @ £1215 ADR; dropping corrects similar inflation.
//   SW11: comp #2 @ £981 ADR; same pattern.
export const OUTLIER_ADR_MULTIPLIER = 3.0;
export const OUTLIER_REVENUE_MULTIPLIER = 2.0;

// A comp is dropped if its distance exceeds this multiple of the
// comp-pool median distance. Catches geocode bugs where Airbtics
// returns non-UK listings attributed to a UK postcode.
//
// Derived from Barrow LA14: comps 3/8/9 located in Connecticut, Annapolis,
// and a Pacific island — all with distances well above the local median.
export const OUTLIER_DISTANCE_MULTIPLIER = 5.0;

// Minimum comps remaining after filters for the Tier A aggregation to be
// considered trustworthy. Below this, the pipeline falls back to Tier B
// (markets/bounds) before giving up.
export const MIN_COMPS_FOR_AGGREGATION = 6;

// ─── Location-class × bedroom occupancy tables ─────────────────────
// Used when the location class is coastal or rural_* (leisure markets).
// For urban/suburban markets, median of comp occupancies is used directly.
//
// Coastal values derived from:
//   Broadstairs 1-bed → 0.80; Broadstairs 4-bed → 0.56;
//   Scarborough 3-bed → 0.53; Barrow 4-bed → 0.64 (outlier, may reflect
//   Cumbria coast vs Kent coast differences).
export const COASTAL_OCCUPANCY_BY_BEDS: Record<number, number> = {
  0: 0.68,
  1: 0.78,
  2: 0.62,
  3: 0.53,
  4: 0.56,
  5: 0.52,
};

// Rural leisure values derived from:
//   Penrith 1-bed → 0.71; Penrith 5-bed → 0.54;
//   Grundisburgh 3-bed → 0.66 (rural village, same pattern).
// 0/2/4-bed values interpolated — revisit as more rural samples arrive.
export const RURAL_LEISURE_OCCUPANCY_BY_BEDS: Record<number, number> = {
  0: 0.65,
  1: 0.71,
  2: 0.65,
  3: 0.60,
  4: 0.56,
  5: 0.54,
};

// ─── Full-time comp pool (income-accuracy fix) ─────────────────────
// The subject is always let 365 days, but a comp's Airbnb occupancy only
// covers the nights it was open. A listing open 100 peak nights at 73% looks
// like a 73%-occupancy property and, spread over 365 days, inflates the
// estimate (26 Kings Road HP11: £92k projected vs £34k–£55k like-for-like).
// So occupancy and RevPAR come from comps that trade all year, where we can
// identify enough of them. See src/lib/apis/income-model.ts.

// A comp is full-time on revenue if it took money in at least this many of
// the last FULLTIME_LOOKBACK_MONTHS months of revenue_ltm_monthly. Deliberately
// NOT based on active_days_count_ltm or Airbnb-available nights: multi-channel
// operators block Airbnb dates for other platforms and would look part-time.
export const FULLTIME_LOOKBACK_MONTHS = 12;
export const FULLTIME_MIN_REVENUE_MONTHS = 10;

// A comp is also full-time if it looks like a professional operator: any of
// these whole words in host_name or the listing name (case-insensitive)…
export const OPERATOR_NAME_TERMS = [
  'ltd', 'limited', 'lettings', 'stays', 'serviced', 'apartments',
  'property', 'properties', 'management', 'homes', 'group',
];
// …or a pipe-separated operator-style listing name with at least this many
// segments, e.g. "Contractor Base | 4BR | WiFi | Parking" (4 segments).
export const OPERATOR_PIPE_MIN_SEGMENTS = 3;

// Minimum full-time comps (after the existing filters) before occupancy and
// RevPAR are taken from them. Below this the pre-existing method is used
// unchanged.
export const MIN_FULLTIME_COMPS = 5;

// Which comps the full-time test looks at:
//   'shown' — the (up to) 12 comps selected for the report;
//   'wide'  — the whole guest-matched list, keeping the first 12 full-time
//             comps in the same review-tier → distance order.
// The displayed comparables are the same 12 either way. Chosen by backtest
// (npm run backtest; 365 cached reports, 5,335 leave-one-out subjects):
// 'shown' 44.9% within ±25% / 28.4% median abs error vs 'wide' 44.5% / 28.6%.
export const FULLTIME_POOL_SCOPE: 'shown' | 'wide' = 'shown';

// Downward mirror of BED_GAP_BOOST_PER_BED: when the subject has fewer
// bedrooms than the full-time pool's median, RevPAR × (1 − 0.12 × gap),
// never below the floor. A 4-bed + sofa bed sleeping 10 should not be priced
// as a 5–6 bed house sleeping 10.
export const BED_GAP_SHRINK_PER_BED = 0.12;
export const BED_GAP_SHRINK_FLOOR = 0.70;

// Standout properties are positioned at this percentile of the full-time
// pool's RevPAR instead of the median.
export const FEATURE_LIFT_PERCENTILE = 0.75;

// specialFeatures values that count as standout for the feature lift.
export const STANDOUT_SPECIAL_FEATURES = new Set<string>([
  'hot_tub', 'pool', 'swimming_pool', 'sea_views', 'lake_views',
  'unique', 'character_property',
]);

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Extract the outward code (before the space) from a UK postcode.
 * "EH1 1BS" → "EH1", "SW1A 1AA" → "SW1A".
 */
export function outwardCodeOf(postcode: string): string {
  return (postcode || '').trim().toUpperCase().split(/\s+/)[0] || '';
}

/**
 * Is this postcode in the compressed-premium list?
 */
export function isCompressedPremium(postcode: string): boolean {
  return COMPRESSED_PREMIUM_POSTCODES.has(outwardCodeOf(postcode));
}

/**
 * Pick the typical occupancy lookup table for a location class.
 * Returns null for urban/suburban — caller should use comp median instead.
 */
export function typicalOccupancyByBeds(
  locationClass: string,
): Record<number, number> | null {
  if (locationClass === 'coastal') return COASTAL_OCCUPANCY_BY_BEDS;
  if (locationClass === 'rural_village' || locationClass === 'rural_isolated') {
    return RURAL_LEISURE_OCCUPANCY_BY_BEDS;
  }
  return null;
}

/**
 * Clamp bedroom count to the range covered by the occupancy tables (0..5).
 * Useful for lookups when subject has 6+ bedrooms (which are unsupported at
 * the route level anyway, but defensive).
 */
export function clampBedsForTable(bedrooms: number): number {
  if (!Number.isFinite(bedrooms)) return 3;
  return Math.max(0, Math.min(5, Math.round(bedrooms)));
}
