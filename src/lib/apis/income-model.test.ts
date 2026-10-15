import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bedroomShrinkFactor,
  classifyFullTime,
  hasStandoutFeatures,
  looksLikeOperator,
  percentile,
  revenueCeiling,
  revenueMonthsInLookback,
  trimMonthlyToCap,
} from './income-model.ts';

const KEYS = [
  '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
];

/** revenue_ltm_monthly with revenue in the first `n` of the 12 months. */
function monthsWithRevenue(n: number): Record<string, number> {
  return Object.fromEntries(KEYS.map((k, i) => [k, i < n ? 2500 : 0]));
}

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);

// ── Full-time classifier ──────────────────────────────────────────

test('full-time: revenue in 10 of the last 12 months passes', () => {
  const c = classifyFullTime({ name: 'Cosy 3 bed house', host_name: 'Jane', revenue_ltm_monthly: monthsWithRevenue(10) });
  assert.deepEqual(c, { fullTime: true, byMonths: true, byOperator: false, revenueMonths: 10 });
});

test('full-time: revenue in only 9 of 12 months is part-time', () => {
  const c = classifyFullTime({ name: 'Cosy 3 bed house', host_name: 'Jane', revenue_ltm_monthly: monthsWithRevenue(9) });
  assert.equal(c.fullTime, false);
  assert.equal(c.revenueMonths, 9);
});

test('full-time: a listing with fewer than 10 months of history cannot pass on revenue', () => {
  const monthly = Object.fromEntries(KEYS.slice(0, 9).map((k) => [k, 3000]));
  assert.equal(classifyFullTime({ name: 'New listing', host_name: 'Jo', revenue_ltm_monthly: monthly }).fullTime, false);
});

test('full-time: only the latest 12 months count', () => {
  // 14 months of data: two old busy months, then 9 of the latest 12 with revenue.
  const monthly: Record<string, number> = { '2025-08': 4000, '2025-09': 4000 };
  KEYS.forEach((k, i) => { monthly[k] = i < 9 ? 2000 : 0; });
  assert.equal(revenueMonthsInLookback(monthly), 9);
  assert.equal(classifyFullTime({ revenue_ltm_monthly: monthly }).byMonths, false);
});

test('full-time: missing monthly data counts as zero months', () => {
  assert.equal(revenueMonthsInLookback(undefined), 0);
  assert.equal(classifyFullTime({ name: 'House', host_name: 'Al' }).fullTime, false);
});

test('full-time: multi-channel operator with few Airbnb-open days still passes on monthly revenue', () => {
  // Blocks Airbnb dates for other platforms (would show low available nights),
  // but takes some Airbnb revenue every month — the test never looks at days.
  const c = classifyFullTime({ name: 'Riverside 2 bed', host_name: 'Mark', revenue_ltm_monthly: monthsWithRevenue(12) });
  assert.equal(c.fullTime, true);
});

test('operator: terms in the host name, case-insensitive', () => {
  assert.equal(looksLikeOperator('Lovely 2 bed', 'Wycombe Short Stays LTD'), true);
  assert.equal(looksLikeOperator('Lovely 2 bed', 'Fullards Lettings'), true);
  assert.equal(looksLikeOperator('Lovely 2 bed', 'Acme Property Management'), true);
  assert.equal(looksLikeOperator('Lovely 2 bed', 'Harbour Homes'), true);
  assert.equal(looksLikeOperator('Lovely 2 bed', 'Blue Group'), true);
});

test('operator: terms in the listing name', () => {
  assert.equal(looksLikeOperator('Central Serviced Apartments with parking', 'Sam'), true);
  assert.equal(looksLikeOperator('Riverside Stays - 3 bed', 'Sam'), true);
});

test('operator: pipe-separated operator-style listing names', () => {
  assert.equal(looksLikeOperator('Contractor Base | 4BR | WiFi | Parking | Wycombe', 'Sam'), true);
  assert.equal(looksLikeOperator('Town house | Sleeps 8 | Parking', 'Sam'), true);
  assert.equal(looksLikeOperator('Town house | Sleeps 8', 'Sam'), false);
});

test('operator: whole words only — no false hits inside other words', () => {
  assert.equal(looksLikeOperator('Charming Homestead near the river', 'Sam'), false);
  assert.equal(looksLikeOperator('Woodland Chilterns Stay 5 bedroom', 'Sam'), false);
  assert.equal(looksLikeOperator('Spacious 4-Bedroom Home', 'Sam'), false);
  assert.equal(looksLikeOperator('Groupie Lane cottage', 'Grouper'), false);
});

test('full-time: an operator with a part-time revenue profile is still full-time', () => {
  const c = classifyFullTime({ name: 'Flat 3', host_name: 'City Stays Ltd', revenue_ltm_monthly: monthsWithRevenue(5) });
  assert.deepEqual(c, { fullTime: true, byMonths: false, byOperator: true, revenueMonths: 5 });
});

// ── Bedroom shrink ────────────────────────────────────────────────

test('bedroom shrink: 12% per bedroom below the pool median', () => {
  close(bedroomShrinkFactor(4, 5), 0.88);
  close(bedroomShrinkFactor(3, 5), 0.76);
});

test('bedroom shrink: floored at 0.70', () => {
  close(bedroomShrinkFactor(2, 5), 0.70); // 1 − 0.36 = 0.64 → floor
  close(bedroomShrinkFactor(1, 6), 0.70);
});

test('bedroom shrink: no change at or above the pool median', () => {
  assert.equal(bedroomShrinkFactor(4, 4), 1);
  assert.equal(bedroomShrinkFactor(5, 4), 1);
});

test('bedroom shrink: fractional median gap scales proportionally', () => {
  close(bedroomShrinkFactor(4, 4.5), 0.94);
});

// ── Feature lift ──────────────────────────────────────────────────

test('feature lift: standout features detected', () => {
  assert.equal(hasStandoutFeatures(['hot_tub']), true);
  assert.equal(hasStandoutFeatures(['ev_charging', 'pool']), true);
  assert.equal(hasStandoutFeatures(['Sea_Views']), true);
  assert.equal(hasStandoutFeatures(['unique']), true);
});

test('feature lift: standard properties are not lifted', () => {
  assert.equal(hasStandoutFeatures([]), false);
  assert.equal(hasStandoutFeatures(undefined), false);
  assert.equal(hasStandoutFeatures(['ev_charging', 'near_events_venue']), false);
});

test('percentile: 75th percentile with linear interpolation', () => {
  close(percentile([100, 200, 300, 400, 500], 0.75), 400);
  close(percentile([100, 200, 300, 400], 0.75), 325);
  close(percentile([400, 100, 300, 200], 0.5), 250);
  assert.equal(percentile([], 0.75), 0);
});

// ── Ceiling ───────────────────────────────────────────────────────

test('ceiling: highest full-time actual when there are 5+ full-time comps', () => {
  assert.deepEqual(
    revenueCeiling([30_000, 41_000, 55_000, 36_000, 48_000], [30_000, 41_000, 55_000, 36_000, 48_000, 138_000]),
    { value: 55_000, source: 'fulltime' },
  );
});

test('ceiling: falls back to all comps with fewer than 5 full-time comps', () => {
  assert.deepEqual(
    revenueCeiling([30_000, 41_000], [30_000, 41_000, 60_000, 72_000]),
    { value: 72_000, source: 'all_comps' },
  );
  assert.deepEqual(revenueCeiling([], [20_000, 25_000]), { value: 25_000, source: 'all_comps' });
});

test('ceiling: null when no comp has revenue', () => {
  assert.equal(revenueCeiling([], []), null);
  assert.equal(revenueCeiling([], [0, 0]), null);
});

test('ceiling: trimming removes rounding excess so the sum never exceeds the cap', () => {
  const trimmed = trimMonthlyToCap([4001, 5002, 3000], 12_000);
  assert.equal(trimmed.reduce((s, v) => s + v, 0), 12_000);
  assert.deepEqual(trimmed, [4001, 4999, 3000]);
  assert.deepEqual(trimMonthlyToCap([1000, 2000], 5000), [1000, 2000]); // under the cap: untouched
});
