// Synthetic Airbtics report/all comps for offline tests of the comp-to-revenue
// logic (buildDataFromReportComps). Generated arithmetically so every field is
// internally consistent: annual revenue is the sum of the monthly revenue, ADR
// is revenue / booked nights, and occupancy is booked / AVAILABLE nights — which
// is exactly how a part-time listing reports a high occupancy on few nights.
//
// No date fields (added_on etc.) are set, matching what report/all returns in
// production, so the outputs do not depend on the current date.

import type { ReportAllResult, ReportComp, ShortLetOptions } from '../airbtics.ts';
import type { LocationClass } from '../../types.ts';

// The LTM window: Oct 2025 → Sep 2026.
const MONTH_KEYS = [
  '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
];
const DAYS = [31, 30, 31, 31, 28, 31, 30, 31, 30, 31, 31, 30];
// Calendar-month seasonal shapes, indexed by position in MONTH_KEYS.
const ADR_SEASON = [0.95, 0.9, 1.05, 0.88, 0.88, 0.92, 0.98, 1.02, 1.1, 1.18, 1.2, 1.04];
const OCC_SEASON = [0.97, 0.85, 0.95, 0.8, 0.85, 0.92, 1.0, 1.05, 1.12, 1.2, 1.22, 1.08];
// Peak-first order a part-time listing opens in (Jul, Aug, Jun, Sep, May, Dec, Apr, Oct, Mar, Nov, Feb, Jan).
const PEAK_ORDER = [9, 10, 8, 11, 7, 2, 6, 0, 5, 1, 4, 3];

export interface CompSpec {
  id: string;
  beds: number;
  guests: number;
  /** Average nightly rate before seasonality. */
  adr: number;
  /** Occupancy (0–100) of the nights the listing is OPEN on Airbnb. */
  occ: number;
  /** Months of the LTM window the listing was open (peak months first). */
  openMonths?: number;
  /** Offset from the scenario centre, in degrees. */
  dLat?: number;
  dLng?: number;
  reviews?: number;
  name?: string;
  host?: string;
  propertyType?: string;
  parking?: boolean;
}

export function makeComp(spec: CompSpec, centre: { lat: number; lng: number }): ReportComp {
  const open = new Set(PEAK_ORDER.slice(0, spec.openMonths ?? 12));
  const revenue: Record<string, number> = {};
  const adrMonthly: Record<string, number> = {};
  const occMonthly: Record<string, number> = {};
  let totalRevenue = 0;
  let booked = 0;
  let available = 0;
  MONTH_KEYS.forEach((key, i) => {
    if (!open.has(i)) {
      revenue[key] = 0;
      adrMonthly[key] = 0;
      occMonthly[key] = 0;
      return;
    }
    const monthOcc = Math.min(100, spec.occ * OCC_SEASON[i]);
    const nights = Math.round((monthOcc / 100) * DAYS[i]);
    const monthAdr = Math.round(spec.adr * ADR_SEASON[i]);
    revenue[key] = nights * monthAdr;
    adrMonthly[key] = monthAdr;
    occMonthly[key] = Math.round(monthOcc);
    totalRevenue += nights * monthAdr;
    booked += nights;
    available += DAYS[i];
  });
  return {
    listingID: spec.id,
    name: spec.name ?? `${spec.beds} bed home ${spec.id}`,
    bedrooms: String(spec.beds), // Airbtics returns bedrooms as a string
    bathrooms: Math.max(1, Math.ceil(spec.beds * 0.75)),
    accommodates: spec.guests,
    latitude: centre.lat + (spec.dLat ?? 0),
    longitude: centre.lng + (spec.dLng ?? 0),
    host_name: spec.host ?? 'Sam',
    room_type: 'Entire home/apt',
    property_type: spec.propertyType ?? 'Entire home',
    minimum_nights: 2,
    visible_review_count: spec.reviews ?? 25,
    reveiw_scores_rating: 4.8,
    amenities: spec.parking ? { free_parking: true, wifi: true } : { wifi: true },
    annual_revenue_ltm: totalRevenue,
    avg_occupancy_rate_ltm: available > 0 ? Math.round((booked / available) * 1000) / 10 : 0,
    avg_booked_daily_rate_ltm: booked > 0 ? Math.round((totalRevenue / booked) * 100) / 100 : 0,
    active_days_count_ltm: available,
    no_of_bookings_ltm: Math.round(booked / 3),
    revenue_ltm_monthly: revenue,
    booked_daily_rate_ltm_monthly: adrMonthly,
    occupancy_rate_ltm_monthly: occMonthly,
  };
}

export interface Scenario {
  name: string;
  postcode: string;
  locationClass: LocationClass;
  bedrooms: number;
  guests: number;
  lat: number;
  lng: number;
  options?: ShortLetOptions;
  report: ReportAllResult;
}

function scenario(
  name: string,
  postcode: string,
  locationClass: LocationClass,
  subject: { bedrooms: number; guests: number },
  centre: { lat: number; lng: number },
  specs: CompSpec[],
  options?: ShortLetOptions,
): Scenario {
  return {
    name,
    postcode,
    locationClass,
    bedrooms: subject.bedrooms,
    guests: subject.guests,
    lat: centre.lat,
    lng: centre.lng,
    options,
    report: {
      id: `fixture-${name}`,
      latitude: centre.lat,
      longitude: centre.lng,
      bedrooms: subject.bedrooms,
      bathrooms: Math.max(1, Math.ceil(subject.bedrooms * 0.75)),
      accommodates: subject.guests,
      radius: 3000,
      comps_status: 'success',
      comps: specs.map((s) => makeComp(s, centre)),
    },
  };
}

// Urban 2-bed, mostly full-time pool with a few part-time peak-only listings.
const URBAN = scenario('urban-ng1', 'NG1 5GY', 'urban', { bedrooms: 2, guests: 6 },
  { lat: 52.9536, lng: -1.1505 }, [
    { id: 'u1', beds: 2, guests: 6, adr: 110, occ: 72, dLat: 0.002 },
    { id: 'u2', beds: 2, guests: 6, adr: 125, occ: 68, dLat: -0.003, host: 'City Stays Ltd' },
    { id: 'u3', beds: 2, guests: 5, adr: 98, occ: 75, dLng: 0.004 },
    { id: 'u4', beds: 2, guests: 6, adr: 140, occ: 82, openMonths: 4, dLng: -0.002 },
    { id: 'u5', beds: 2, guests: 6, adr: 105, occ: 66, dLat: 0.005, dLng: 0.002 },
    { id: 'u6', beds: 3, guests: 6, adr: 150, occ: 60, dLat: -0.004, dLng: 0.003 },
    { id: 'u7', beds: 2, guests: 7, adr: 118, occ: 70, dLat: 0.006 },
    { id: 'u8', beds: 2, guests: 6, adr: 160, occ: 88, openMonths: 3, dLng: 0.006 },
    { id: 'u9', beds: 1, guests: 5, adr: 90, occ: 74, dLat: -0.006 },
    { id: 'u10', beds: 2, guests: 6, adr: 112, occ: 64, dLat: 0.003, dLng: -0.005, reviews: 6 },
    { id: 'u11', beds: 2, guests: 6, adr: 130, occ: 79, openMonths: 6, dLat: -0.002, dLng: -0.006 },
    { id: 'u12', beds: 2, guests: 6, adr: 102, occ: 69, dLat: 0.008, reviews: 2 },
    { id: 'u13', beds: 2, guests: 4, adr: 95, occ: 71, dLat: -0.008 },
    { id: 'u14', beds: 2, guests: 6, adr: 121, occ: 67, dLng: 0.009, name: 'Serviced Apartments | 2BR | Parking | Central' },
  ]);

// Rural 4-bed sleeping 10 (sofa bed) — the 26 Kings Road shape: many part-time
// peak-only listings with high Airbnb occupancy, and 5–6 bed houses in the pool.
const RURAL_SOFA_BED = scenario('rural-hp11', 'HP11 1SA', 'rural_village', { bedrooms: 4, guests: 10 },
  { lat: 51.6286, lng: -0.7482 }, [
    { id: 'r1', beds: 4, guests: 7, adr: 286, occ: 68, openMonths: 5, dLat: 0.012 },
    { id: 'r2', beds: 3, guests: 7, adr: 216, occ: 61, openMonths: 9, dLat: -0.018 },
    { id: 'r3', beds: 5, guests: 10, adr: 581, occ: 75, openMonths: 10, dLng: 0.04 },
    { id: 'r4', beds: 4, guests: 10, adr: 287, occ: 71, openMonths: 7, dLng: -0.05 },
    { id: 'r5', beds: 6, guests: 9, adr: 361, occ: 36, dLat: 0.03, dLng: 0.03 },
    { id: 'r6', beds: 4, guests: 10, adr: 715, occ: 52, openMonths: 8, dLat: -0.04, dLng: 0.02 },
    { id: 'r7', beds: 4, guests: 7, adr: 480, occ: 73, openMonths: 3, dLat: 0.05 },
    { id: 'r8', beds: 4, guests: 11, adr: 793, occ: 38, dLat: -0.05, dLng: -0.03, name: 'The Atelier by Fullards', host: 'Fullards Lettings' },
    { id: 'r9', beds: 4, guests: 9, adr: 408, occ: 50, openMonths: 7, dLng: 0.025, reviews: 6, name: 'Contractor Base | 4BR | WiFi | Parking | Wycombe' },
    { id: 'r10', beds: 5, guests: 10, adr: 437, occ: 94, openMonths: 7, dLat: 0.022, reviews: 5 },
    { id: 'r11', beds: 4, guests: 8, adr: 492, occ: 52, openMonths: 7, dLat: -0.045 },
    { id: 'r12', beds: 4, guests: 10, adr: 654, occ: 38, openMonths: 8, dLat: 0.028, reviews: 0 },
    { id: 'r13', beds: 4, guests: 10, adr: 260, occ: 62, dLat: 0.035, dLng: -0.02 },
    { id: 'r14', beds: 5, guests: 10, adr: 300, occ: 58, dLat: -0.03, dLng: -0.04 },
    { id: 'r15', beds: 4, guests: 9, adr: 240, occ: 66, dLat: 0.015, dLng: 0.045 },
  ]);

// Coastal 1-bed — exercises the coastal-small mean aggregation and the coastal table.
const COASTAL_SMALL = scenario('coastal-ct10', 'CT10 1AA', 'coastal', { bedrooms: 1, guests: 2 },
  { lat: 51.3598, lng: 1.4357 }, [
    { id: 'c1', beds: 1, guests: 2, adr: 95, occ: 78, dLat: 0.003 },
    { id: 'c2', beds: 1, guests: 2, adr: 120, occ: 70, dLat: -0.004 },
    { id: 'c3', beds: 1, guests: 3, adr: 88, occ: 82, dLng: 0.005 },
    { id: 'c4', beds: 1, guests: 2, adr: 140, occ: 85, openMonths: 4, dLng: -0.003 },
    { id: 'c5', beds: 1, guests: 2, adr: 101, occ: 74, dLat: 0.006 },
    { id: 'c6', beds: 1, guests: 2, adr: 110, occ: 60, dLat: -0.007, dLng: 0.004 },
    { id: 'c7', beds: 0, guests: 2, adr: 80, occ: 79, dLat: 0.009 },
    { id: 'c8', beds: 1, guests: 2, adr: 160, occ: 66, dLng: 0.01 },
    { id: 'c9', beds: 1, guests: 1, adr: 75, occ: 71, dLat: -0.01 },
    { id: 'c10', beds: 1, guests: 2, adr: 99, occ: 77, openMonths: 6, dLat: 0.012 },
    { id: 'c11', beds: 1, guests: 2, adr: 115, occ: 73, dLng: -0.012 },
    { id: 'c12', beds: 2, guests: 2, adr: 130, occ: 64, dLat: -0.013 },
    { id: 'c13', beds: 1, guests: 2, adr: 92, occ: 80, dLat: 0.014, dLng: 0.01 },
  ]);

// Compressed-premium postcode with the subject sleeping fewer than the pool.
const COMPRESSED = scenario('compressed-eh1', 'EH1 1BS', 'urban', { bedrooms: 2, guests: 3 },
  { lat: 55.9496, lng: -3.1914 }, [
    { id: 'e1', beds: 2, guests: 4, adr: 210, occ: 80, dLat: 0.002 },
    { id: 'e2', beds: 2, guests: 4, adr: 190, occ: 77, dLat: -0.002 },
    { id: 'e3', beds: 2, guests: 5, adr: 260, occ: 74, dLng: 0.003 },
    { id: 'e4', beds: 2, guests: 4, adr: 175, occ: 83, dLng: -0.003 },
    { id: 'e5', beds: 1, guests: 4, adr: 160, occ: 79, dLat: 0.004 },
    { id: 'e6', beds: 2, guests: 4, adr: 240, occ: 69, dLat: -0.004 },
    { id: 'e7', beds: 2, guests: 4, adr: 200, occ: 81, openMonths: 5, dLng: 0.005 },
    { id: 'e8', beds: 3, guests: 4, adr: 280, occ: 65, dLng: -0.005 },
    { id: 'e9', beds: 2, guests: 3, adr: 185, occ: 76, dLat: 0.006 },
    { id: 'e10', beds: 2, guests: 4, adr: 205, occ: 78, dLat: -0.006 },
    { id: 'e11', beds: 2, guests: 4, adr: 230, occ: 72, dLat: 0.007, dLng: 0.002 },
    { id: 'e12', beds: 2, guests: 4, adr: 195, occ: 84, dLat: -0.007, dLng: -0.002 },
  ]);

// Subject has more bedrooms than the pool at equal guests → existing +15%/bed boost.
const BED_GAP_BOOST = scenario('boost-m1', 'M1 1AE', 'urban', { bedrooms: 3, guests: 6 },
  { lat: 53.4794, lng: -2.2453 }, [
    { id: 'm1', beds: 2, guests: 6, adr: 120, occ: 72, dLat: 0.002 },
    { id: 'm2', beds: 2, guests: 6, adr: 128, occ: 70, dLat: -0.002 },
    { id: 'm3', beds: 2, guests: 6, adr: 115, occ: 75, dLng: 0.003 },
    { id: 'm4', beds: 2, guests: 6, adr: 135, occ: 66, dLng: -0.003 },
    { id: 'm5', beds: 2, guests: 6, adr: 110, occ: 78, dLat: 0.004 },
    { id: 'm6', beds: 3, guests: 6, adr: 150, occ: 63, dLat: -0.004 },
    { id: 'm7', beds: 2, guests: 6, adr: 125, occ: 71, dLng: 0.005 },
    { id: 'm8', beds: 2, guests: 6, adr: 118, occ: 74, dLng: -0.005 },
    { id: 'm9', beds: 2, guests: 6, adr: 122, occ: 69, dLat: 0.006 },
    { id: 'm10', beds: 2, guests: 6, adr: 130, occ: 73, dLat: -0.006 },
    { id: 'm11', beds: 2, guests: 6, adr: 112, occ: 76, dLat: 0.007 },
    { id: 'm12', beds: 2, guests: 6, adr: 140, occ: 65, dLat: -0.007 },
  ], { parkingSpaces: 1, outdoorSpace: 'garden', hasParking: true });

// Thin pool (7 comps) — moderate data quality, outlier filter falls back.
const THIN = scenario('thin-ls1', 'LS1 4AP', 'urban', { bedrooms: 3, guests: 8 },
  { lat: 53.7997, lng: -1.5492 }, [
    { id: 't1', beds: 3, guests: 8, adr: 170, occ: 66, dLat: 0.003 },
    { id: 't2', beds: 3, guests: 8, adr: 155, occ: 70, dLat: -0.003 },
    { id: 't3', beds: 4, guests: 8, adr: 210, occ: 58, dLng: 0.004 },
    { id: 't4', beds: 3, guests: 7, adr: 640, occ: 61, dLng: -0.004 },
    { id: 't5', beds: 3, guests: 8, adr: 180, occ: 88, openMonths: 4, dLat: 0.005 },
    { id: 't6', beds: 3, guests: 9, adr: 165, occ: 64, dLat: -0.005 },
    { id: 't7', beds: 3, guests: 8, adr: 175, occ: 69, dLat: 0.25 },
  ]);

// No usable comps (all zero revenue) → generic market estimate.
const NO_COMPS = scenario('none-ng7', 'NG7 2RD', 'urban', { bedrooms: 2, guests: 6 },
  { lat: 52.9548, lng: -1.1812 }, [
    { id: 'n1', beds: 2, guests: 6, adr: 100, occ: 0 },
    { id: 'n2', beds: 2, guests: 6, adr: 100, occ: 0 },
  ]);

export const SCENARIOS: Scenario[] = [
  URBAN, RURAL_SOFA_BED, COASTAL_SMALL, COMPRESSED, BED_GAP_BOOST, THIN, NO_COMPS,
];
