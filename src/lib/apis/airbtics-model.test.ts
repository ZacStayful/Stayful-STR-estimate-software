import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataFromReportComps, type CompRevenueRunOptions } from './airbtics.ts';
import { SCENARIOS, makeComp, type Scenario } from './__fixtures__/report-comps.ts';
import { classifyFullTime } from './income-model.ts';

// Golden outputs captured from buildDataFromReportComps BEFORE the full-time
// income model was added (commit "Export comp-to-revenue logic for offline
// use"). The legacy model must keep reproducing them exactly — this is what
// lets the backtest's OLD column stand for what production does today.
const GOLDEN = JSON.parse(
  readFileSync(new URL('./__fixtures__/legacy-golden.json', import.meta.url), 'utf8'),
);

const silent = () => {};

function run(s: Scenario, opts: CompRevenueRunOptions = {}, overrides: Partial<Scenario> = {}) {
  const x = { ...s, ...overrides };
  return buildDataFromReportComps(
    x.report, x.bedrooms, x.guests, x.lat, x.lng, x.locationClass, x.postcode, x.options,
    { log: silent, ...opts },
  );
}

const byName = (name: string) => {
  const s = SCENARIOS.find((x) => x.name === name);
  if (!s) throw new Error(`no scenario ${name}`);
  return s;
};

for (const s of SCENARIOS) {
  test(`legacy model reproduces the pre-change output: ${s.name}`, () => {
    const result = run(s, { model: 'legacy' });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), GOLDEN[s.name]);
  });
}

// ── Full-time model ───────────────────────────────────────────────

test('full-time model is the default and records its path', () => {
  const result = run(byName('urban-ng1'));
  assert.equal(result.data.incomeModel?.model, 'fulltime');
  assert.ok(['fulltime', 'fallback'].includes(result.data.incomeModel!.path));
});

test('full-time path: part-time comps are excluded from occupancy and RevPAR', () => {
  // urban-ng1 has 3 peak-only listings (open 3–6 months, 79–88% occupancy).
  const s = byName('urban-ng1');
  const fresh = run(s, { ftScope: 'shown' });
  const meta = fresh.data.incomeModel!;
  assert.equal(meta.path, 'fulltime');
  assert.ok(meta.fullTimeComps >= 5);
  assert.equal(meta.compsInPool, meta.fullTimeComps);
  assert.equal(meta.occupancySource, 'fulltime_comp_median');
  // Peak-only comps' inflated occupancy no longer lifts the median.
  const legacy = run(s, { model: 'legacy' });
  assert.ok(fresh.data.occupancyRate <= legacy.data.occupancyRate);
  assert.ok(fresh.data.annualRevenue <= legacy.data.annualRevenue);
});

test('fallback: fewer than 5 full-time comps keeps the pre-existing RevPAR and occupancy', () => {
  // thin-ls1 has 7 comps; make all but four part-time.
  const s = byName('thin-ls1');
  const centre = { lat: s.lat, lng: s.lng };
  const comps = s.report.comps.map((c, i) =>
    i < 3 ? makeComp({ id: c.listingID, beds: 3, guests: 8, adr: 170, occ: 70, openMonths: 5, dLat: 0.001 * (i + 1) }, centre) : c,
  );
  const report = { ...s.report, comps };
  assert.ok(comps.filter((c) => classifyFullTime(c).fullTime).length < 5);
  const fresh = run(s, {}, { report });
  const legacy = run(s, { model: 'legacy' }, { report });
  const meta = fresh.data.incomeModel!;
  assert.equal(meta.path, 'fallback');
  assert.equal(fresh.data.occupancyRate, legacy.data.occupancyRate);
  // Identical apart from the ceiling, which can only lower it.
  if (!meta.ceiling.applied) {
    assert.equal(fresh.data.annualRevenue, legacy.data.annualRevenue);
  } else {
    assert.ok(fresh.data.annualRevenue < legacy.data.annualRevenue);
  }
  assert.equal(meta.ceiling.source, 'all_comps');
});

test('rural/coastal typical-occupancy table path is unchanged', () => {
  const rural = run(byName('rural-hp11'));
  assert.equal(rural.data.incomeModel?.occupancySource, 'typical_table:rural_village:4bed');
  assert.equal(rural.data.occupancyRate, 0.56);
  const coastal = run(byName('coastal-ct10'));
  assert.equal(coastal.data.incomeModel?.occupancySource, 'typical_table:coastal:1bed');
});

test('ceiling: headline never exceeds the best actual comp revenue, and is recorded', () => {
  for (const s of SCENARIOS) {
    const result = run(s);
    const meta = result.data.incomeModel;
    if (!meta) continue; // no-comps scenario: generic estimate
    if (meta.ceiling.value != null) {
      assert.ok(result.data.annualRevenue <= meta.ceiling.value, `${s.name}: ${result.data.annualRevenue} > cap ${meta.ceiling.value}`);
      assert.equal(result.data.monthlyRevenue.reduce((a, b) => a + b, 0), result.data.annualRevenue);
    }
    assert.equal(meta.ceiling.applied, meta.ceiling.preCeilingRevenue > result.data.annualRevenue);
  }
});

test('ceiling: scales nightly rate, not occupancy', () => {
  // A pool of full-time comps earning modest money but showing a high RevPAR
  // relative to it is impossible; force the cap instead via a tiny best comp.
  const s = byName('boost-m1');
  const uncapped = run(s, { model: 'legacy' });
  const capped = run(s);
  const meta = capped.data.incomeModel!;
  if (meta.ceiling.applied) {
    assert.equal(capped.data.occupancyRate, uncapped.data.occupancyRate);
    assert.ok(capped.data.averageDailyRate < uncapped.data.averageDailyRate);
  }
  assert.ok(capped.data.annualRevenue <= (meta.ceiling.value ?? Infinity));
});

test('bedroom shrink: subject with fewer bedrooms than the full-time pool is priced down', () => {
  // urban-ng1's full-time pool is mostly 2-bed; a 1-bed subject at the same
  // guest count is a bed short of the pool median.
  const s = byName('urban-ng1');
  const one = run(s, { ftScope: 'shown' }, { bedrooms: 1 });
  const two = run(s, { ftScope: 'shown' }, { bedrooms: 2 });
  const meta = one.data.incomeModel!;
  assert.equal(meta.path, 'fulltime');
  assert.equal(meta.subjectAdjustment.poolMedianBeds, 2);
  assert.equal(meta.subjectAdjustment.factor, 0.88);
  assert.match(meta.subjectAdjustment.reason, /^bed_gap_shrink/);
  assert.ok(Math.abs(meta.adjustedRevPAR - meta.targetRevPAR * 0.88) < 0.02);
  assert.equal(two.data.incomeModel!.subjectAdjustment.factor, 1);
});

test('bedroom shrink does not run on the fallback path', () => {
  const s = byName('thin-ls1');
  const centre = { lat: s.lat, lng: s.lng };
  const comps = s.report.comps.map((c, i) =>
    i < 4 ? makeComp({ id: c.listingID, beds: 4, guests: 8, adr: 200, occ: 70, openMonths: 4, dLat: 0.001 * (i + 1) }, centre) : c,
  );
  const result = run(s, {}, { report: { ...s.report, comps }, bedrooms: 2 });
  assert.equal(result.data.incomeModel!.path, 'fallback');
  assert.doesNotMatch(result.data.incomeModel!.subjectAdjustment.reason, /bed_gap_shrink/);
});

test('existing +15% per extra bedroom boost is unchanged on the full-time path', () => {
  const result = run(byName('boost-m1'));
  const meta = result.data.incomeModel!;
  assert.equal(meta.path, 'fulltime');
  assert.match(meta.subjectAdjustment.reason, /^bed_gap_boost/);
  assert.equal(meta.subjectAdjustment.factor, 1.15);
});

test('feature lift: standout property uses the 75th percentile, standard keeps the median', () => {
  const s = byName('urban-ng1');
  const standard = run(s, { ftScope: 'shown' });
  const hotTub = run(s, { ftScope: 'shown' }, { options: { specialFeatures: ['hot_tub'] } });
  assert.equal(standard.data.incomeModel!.featureLift.applied, false);
  assert.equal(standard.data.incomeModel!.aggregationMethod, 'median');
  const lift = hotTub.data.incomeModel!.featureLift;
  assert.equal(lift.applied, true);
  assert.ok(lift.toRevPAR > lift.fromRevPAR);
  assert.equal(lift.fromRevPAR, standard.data.incomeModel!.targetRevPAR);
  assert.match(hotTub.data.incomeModel!.aggregationMethod, /feature_lift_p75$/);
});

test('Kings Road shape: sofa-bed 4-bed no longer priced off part-time peak listings', () => {
  const s = byName('rural-hp11');
  const legacy = run(s, { model: 'legacy' });
  for (const ftScope of ['shown', 'wide'] as const) {
    const fresh = run(s, { ftScope });
    assert.ok(fresh.data.annualRevenue < legacy.data.annualRevenue * 0.8,
      `${ftScope}: ${fresh.data.annualRevenue} vs legacy ${legacy.data.annualRevenue}`);
    assert.equal(fresh.data.occupancyRate, legacy.data.occupancyRate); // rural table untouched
  }
});

test('wide scope looks beyond the 12 displayed comps; displayed comparables unchanged', () => {
  // rural-hp11 plus six more guest-matched full-time houses (new listings, so
  // they sort after the established ones), making the guest-matched list
  // longer than the 12 that get displayed.
  const s = byName('rural-hp11');
  const centre = { lat: s.lat, lng: s.lng };
  const extra = [1, 2, 3, 4, 5, 6].map((i) =>
    makeComp({ id: `x${i}`, beds: 4, guests: 9, adr: 230 + i * 10, occ: 60, dLat: 0.05 + i * 0.004, reviews: 1 }, centre),
  );
  const report = { ...s.report, comps: [...s.report.comps, ...extra] };
  const shown = run(s, { ftScope: 'shown' }, { report });
  const wide = run(s, { ftScope: 'wide' }, { report });
  assert.equal(shown.data.comparables.length, 12);
  assert.ok(wide.data.incomeModel!.compsConsidered > shown.data.incomeModel!.compsConsidered);
  assert.ok(wide.data.incomeModel!.fullTimeComps > shown.data.incomeModel!.fullTimeComps);
  assert.deepEqual(wide.data.comparables, shown.data.comparables);
});
