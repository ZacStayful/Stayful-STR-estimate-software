#!/usr/bin/env node
/**
 * Offline leave-one-out backtest of the income model, OLD vs NEW.
 *
 *   npm run backtest
 *   (= node --import ./scripts/register-test-resolver.mjs scripts/backtest.mjs)
 *
 * Reads the raw Airbtics reports saved by scripts/backtest-fetch.mjs from
 * scripts/.backtest-data/reports/ and makes NO network calls. It runs the real
 * comp-to-revenue function (buildDataFromReportComps in
 * src/lib/apis/airbtics.ts) in three configurations:
 *
 *   OLD        model 'legacy'  — what production did before this change
 *   NEW-shown  model 'fulltime', full-time test over the 12 displayed comps
 *   NEW-wide   model 'fulltime', full-time test over the guest-matched list
 *
 * Leave-one-out: every comp that is full-time (classifyFullTime) and has at
 * least 12 months of monthly data is hidden in turn and its annual revenue is
 * predicted from the other comps in the same report, using its own bedrooms,
 * guest count and location. Each listing is used once (first report it
 * appears in, by cache key). Actual = its annual_revenue_ltm.
 *
 * Output: markdown on stdout, plus scripts/.backtest-data/results.{md,json}.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataFromReportComps, classifyLocation } from '../src/lib/apis/airbtics.ts';
import { classifyFullTime } from '../src/lib/apis/income-model.ts';
import { getCostBreakdown } from '../src/lib/analysis.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '.backtest-data');
const REPORTS = join(DATA, 'reports');
const silent = () => {};

const VERSIONS = [
  { key: 'old', label: 'OLD', run: { model: 'legacy' } },
  { key: 'shown', label: 'NEW-shown', run: { model: 'fulltime', ftScope: 'shown' } },
  { key: 'wide', label: 'NEW-wide', run: { model: 'fulltime', ftScope: 'wide' } },
];

// EXPERIMENT — not part of the shipped model. A comp's Airbnb occupancy is
// measured on the nights it was open on Airbnb, so even a "full-time" comp's
// ADR × occupancy overstates what it earns per calendar day. This variant
// re-expresses every comp's occupancy over 365 days (booked nights / 365, i.e.
// RevPAR = annual revenue / 365) and runs the NEW model on that, to show what
// a follow-up change would do. Reported in its own column only.
const EXPERIMENT = { key: 'cal', label: 'EXP calendar-day' };
function toCalendarDays(comps) {
  return comps.map((c) => {
    const adr = c.avg_booked_daily_rate_ltm ?? 0;
    const perDay = (c.annual_revenue_ltm ?? 0) / 365;
    return { ...c, avg_occupancy_rate_ltm: adr > 0 ? Math.min(100, (perDay / adr) * 100) : 0 };
  });
}

// 26 Kings Road as it was reported (analyser_reports cab1362f…, 2026-10-09).
const KINGS_ROAD = {
  cacheKey: 'HP111SA_4bed',
  postcode: 'HP11 1SA',
  bedrooms: 4,
  guests: 10,
  reported: { gross: 92358, occupancy: 0.56, adr: 450, net: 48026 },
};

/** "HP111SA" → "HP11 1SA" so classifyLocation reads the outward code. */
function formatPostcode(compact) {
  return compact.length >= 5 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}
const areaOf = (postcode) => (postcode.match(/^[A-Z]{1,2}/) ?? ['?'])[0];
const bedBucket = (b) => (b >= 6 ? '6+' : String(b));
const MONTH_KEY = /^\d{4}-\d{2}$/;
const CONSISTENT_TOLERANCE = 0.25;
// A segment is flagged when the shipped NEW is at least this much worse than
// OLD on share-within-±25% or on median absolute error (percentage points).
const MATERIAL = 0.03;

function loadReports() {
  if (!existsSync(REPORTS)) return [];
  return readdirSync(REPORTS)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.unreadable.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(REPORTS, f), 'utf8')));
}

function predict(report, subject, run) {
  return buildDataFromReportComps(
    report, subject.bedrooms, subject.guests, subject.lat, subject.lng,
    subject.locationClass, subject.postcode, subject.options ?? {}, { ...run, log: silent },
  );
}

// ── Metrics ───────────────────────────────────────────────────────

const median = (xs) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function metrics(rows, key) {
  const errs = rows.map((r) => r.err[key]);
  const n = errs.length;
  if (n === 0) return { n: 0 };
  return {
    n,
    within15: errs.filter((e) => Math.abs(e) <= 0.15).length / n,
    within25: errs.filter((e) => Math.abs(e) <= 0.25).length / n,
    medianAbsErr: median(errs.map(Math.abs)),
    meanBias: errs.reduce((s, e) => s + e, 0) / n,
    medianBias: median(errs),
  };
}

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '–');
const signed = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '–');
const gbp = (v) => `£${Math.round(v).toLocaleString('en-GB')}`;

function betterOf(a, b) {
  if (a.within25 !== b.within25) return a.within25 > b.within25 ? 'a' : 'b';
  return a.medianAbsErr <= b.medianAbsErr ? 'a' : 'b';
}

// ── Kings Road ────────────────────────────────────────────────────

function kingsRoad(reports) {
  const file = reports.find((r) => r.cache_key === KINGS_ROAD.cacheKey);
  if (!file) return null;
  const report = file.report;
  const base = {
    bedrooms: KINGS_ROAD.bedrooms,
    guests: KINGS_ROAD.guests,
    lat: report.latitude,
    lng: report.longitude,
    postcode: KINGS_ROAD.postcode,
    locationClass: classifyLocation(KINGS_ROAD.postcode),
  };
  // The stored report doesn't record the parking answer, which only changes
  // comp ordering; use whichever reproduces the reported figure under OLD.
  const candidates = [{}, { hasParking: true }];
  let options = candidates[0];
  for (const o of candidates) {
    if (predict(report, { ...base, options: o }, VERSIONS[0].run).data.annualRevenue === KINGS_ROAD.reported.gross) {
      options = o;
      break;
    }
  }
  const out = {};
  const runs = [...VERSIONS, { key: 'cal', run: { model: 'fulltime', ftScope: winner }, calendar: true }];
  for (const v of runs) {
    const r = predict(v.calendar ? { ...report, comps: toCalendarDays(report.comps) } : report, { ...base, options }, v.run);
    out[v.key] = {
      gross: r.data.annualRevenue,
      occupancy: r.data.occupancyRate,
      adr: r.data.averageDailyRate,
      net: Math.round(getCostBreakdown(r.data.annualRevenue).netRevenue),
      meta: r.data.incomeModel ?? null,
    };
  }
  const reproduced = out.old.gross === KINGS_ROAD.reported.gross;
  const ft = report.comps.map((c) => ({ c, cls: classifyFullTime(c) }));
  return {
    out, options, reproduced, rawComps: report.comps.length,
    fullTimeInReport: ft.filter((x) => x.cls.fullTime).length,
    locationClass: base.locationClass,
  };
}

// ── Main ──────────────────────────────────────────────────────────

const reports = loadReports();
if (reports.length === 0) {
  console.error('No saved reports. Run scripts/backtest-fetch.mjs first.');
  process.exit(1);
}

const rows = [];
const seen = new Set();
let compsTotal = 0;
let monthlyMax = '';
for (const file of reports) {
  const report = file.report;
  const compact = file.cache_key.split('_')[0];
  const postcode = formatPostcode(compact);
  const locationClass = classifyLocation(postcode);
  compsTotal += report.comps.length;
  for (const comp of report.comps) {
    const keys = Object.keys(comp.revenue_ltm_monthly ?? {}).filter((k) => MONTH_KEY.test(k)).sort();
    if (keys.length && keys[keys.length - 1] > monthlyMax) monthlyMax = keys[keys.length - 1];
    if (seen.has(comp.listingID)) continue;
    // Our subjects are always whole homes; private rooms in the pool stay as
    // comps (as in production) but aren't used as test subjects.
    if (comp.room_type && comp.room_type !== 'entire_home') continue;
    if (keys.length < 12) continue;
    const cls = classifyFullTime(comp);
    if (!cls.fullTime) continue;
    const actual = comp.annual_revenue_ltm ?? 0;
    const beds = typeof comp.bedrooms === 'string' ? parseInt(comp.bedrooms, 10) : comp.bedrooms;
    const guests = comp.accommodates ?? 0;
    if (!(actual > 0) || !Number.isFinite(beds) || !(guests > 0)) continue;
    seen.add(comp.listingID);

    const rest = { ...report, comps: report.comps.filter((c) => c !== comp) };
    const subject = { bedrooms: beds, guests, lat: comp.latitude, lng: comp.longitude, postcode, locationClass };
    const last12 = keys.slice(-12).reduce((sum, k) => sum + (comp.revenue_ltm_monthly[k] ?? 0), 0);
    const row = {
      cacheKey: file.cache_key, listingID: comp.listingID, name: comp.name, area: areaOf(postcode),
      locationClass, beds, guests, actual, byMonths: cls.byMonths, byOperator: cls.byOperator,
      // The monthly series lags annual_revenue_ltm by months. Where the two
      // disagree by more than 25% the listing changed how much it traded in
      // between (opened, paused, delisted), so its "actual" is not a clean
      // full-year figure.
      consistent: Math.abs(last12 - actual) / actual <= CONSISTENT_TOLERANCE,
      pred: {}, err: {}, path: {}, ceilingApplied: {}, bedShrink: {},
    };
    for (const v of VERSIONS) {
      const r = predict(rest, subject, v.run);
      row.pred[v.key] = r.data.annualRevenue;
      row.err[v.key] = (r.data.annualRevenue - actual) / actual;
      row.path[v.key] = r.data.incomeModel?.path ?? (v.key === 'old' ? 'legacy' : 'no_comps');
      row.ceilingApplied[v.key] = r.data.incomeModel?.ceiling.applied ?? false;
      row.bedShrink[v.key] = /bed_gap_shrink/.test(r.data.incomeModel?.subjectAdjustment.reason ?? '');
    }
    Object.defineProperty(row, 'inputs', { value: { rest, subject }, enumerable: false });
    rows.push(row);
  }
}

const overall = Object.fromEntries(VERSIONS.map((v) => [v.key, metrics(rows, v.key)]));
const winner = betterOf(overall.shown, overall.wide) === 'a' ? 'shown' : 'wide';
const winnerLabel = VERSIONS.find((v) => v.key === winner).label;

// Experiment pass, on the winning scope.
const expRun = { model: 'fulltime', ftScope: winner };
for (const row of rows) {
  const { rest, subject } = row.inputs;
  const r = predict({ ...rest, comps: toCalendarDays(rest.comps) }, subject, expRun);
  row.pred.cal = r.data.annualRevenue;
  row.err.cal = (r.data.annualRevenue - row.actual) / row.actual;
}
overall.cal = metrics(rows, 'cal');

const lines = [];
const p = (s = '') => lines.push(s);

p('# Income model backtest — OLD vs NEW');
p();
p(`Reports: **${reports.length}** cached Airbtics reports, **${compsTotal}** raw comps. Latest month in the monthly series: ${monthlyMax}.`);
p(`Leave-one-out subjects (whole homes, full-time, ≥12 months of monthly data, deduplicated): **${rows.length}**.`);
p();
function overallTable(subset) {
  p('| Version | n | within ±15% | within ±25% | median abs error | mean bias | median bias |');
  p('|---|---:|---:|---:|---:|---:|---:|');
  for (const v of [...VERSIONS, { ...EXPERIMENT, label: `${EXPERIMENT.label} (${winnerLabel}, not shipped)` }]) {
    const m = metrics(subset, v.key);
    p(`| ${v.label} | ${m.n} | ${pct(m.within15)} | ${pct(m.within25)} | ${pct(m.medianAbsErr)} | ${signed(m.meanBias)} | ${signed(m.medianBias)} |`);
  }
  p();
}
const consistentRows = rows.filter((r) => r.consistent);
p('## Overall');
p();
overallTable(rows);
p(`### Subjects whose monthly data agrees with their annual revenue (±${CONSISTENT_TOLERANCE * 100}%)`);
p();
p(`${consistentRows.length} of ${rows.length} subjects. The rest opened, paused or delisted between Airbtics' monthly window and its annual figure, so their "actual" is not a clean full year.`);
p();
overallTable(consistentRows);
p(`Better NEW scope: **${winnerLabel}** (higher share within ±25%, tie-break median abs error).`);
for (const v of VERSIONS.slice(1)) {
  const share = rows.filter((r) => r.path[v.key] === 'fulltime').length / (rows.length || 1);
  const cap = rows.filter((r) => r.ceilingApplied[v.key]).length / (rows.length || 1);
  const shrink = rows.filter((r) => r.bedShrink[v.key]).length / (rows.length || 1);
  p(`- ${v.label}: full-time path on ${pct(share)} of predictions (rest fall back to the old method); bedroom shrink on ${pct(shrink)}; ceiling applied on ${pct(cap)}.`);
}
p();

function breakdown(title, keyFn, order) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const keys = [...groups.keys()].sort(order ?? ((a, b) => groups.get(b).length - groups.get(a).length));
  p(`## By ${title}`);
  p();
  p(`| ${title} | n | OLD ±25% | ${winnerLabel} ±25% | OLD med abs err | ${winnerLabel} med abs err | OLD bias | ${winnerLabel} bias | NEW worse (≥${MATERIAL * 100} pts)? |`);
  p('|---|---:|---:|---:|---:|---:|---:|---:|---|');
  const worse = [];
  for (const k of keys) {
    const g = groups.get(k);
    const o = metrics(g, 'old');
    const w = metrics(g, winner);
    const material = g.length >= 10 && (o.within25 - w.within25 >= MATERIAL || w.medianAbsErr - o.medianAbsErr >= MATERIAL);
    const slight = !material && g.length >= 10 && (w.within25 < o.within25 || w.medianAbsErr > o.medianAbsErr);
    if (material) worse.push(k);
    p(`| ${k} | ${g.length} | ${pct(o.within25)} | ${pct(w.within25)} | ${pct(o.medianAbsErr)} | ${pct(w.medianAbsErr)} | ${signed(o.meanBias)} | ${signed(w.meanBias)} | ${material ? '**yes**' : slight ? 'slightly' : g.length < 10 ? '(n<10)' : ''} |`);
  }
  p();
  return worse;
}

const worseArea = breakdown('postcode area', (r) => r.area);
const worseClass = breakdown('location class', (r) => r.locationClass);
const worseBeds = breakdown('bedrooms', (r) => bedBucket(r.beds), (a, b) => (a === '6+' ? 99 : +a) - (b === '6+' ? 99 : +b));

function worst(key, label) {
  p(`## 10 worst — ${label}`);
  p();
  p('| listing | area | beds/guests | actual | predicted | error |');
  p('|---|---|---|---:|---:|---:|');
  for (const r of [...rows].sort((a, b) => Math.abs(b.err[key]) - Math.abs(a.err[key])).slice(0, 10)) {
    p(`| ${r.listingID} ${String(r.name ?? '').slice(0, 40).replace(/\|/g, '/')} | ${r.cacheKey.split('_')[0]} | ${r.beds}/${r.guests} | ${gbp(r.actual)} | ${gbp(r.pred[key])} | ${signed(r.err[key])} |`);
  }
  p();
}
worst('old', 'OLD');
worst(winner, winnerLabel);

const kr = kingsRoad(reports);
if (kr) {
  p('## 26 Kings Road, HP11 1SA (4 bed, sleeps 10)');
  p();
  p(`Cached report: ${kr.rawComps} raw comps, ${kr.fullTimeInReport} full-time by the new test. Location class: ${kr.locationClass}. OLD ${kr.reproduced ? 'reproduces' : 'does NOT reproduce'} the reported £${KINGS_ROAD.reported.gross.toLocaleString('en-GB')}.`);
  p();
  p(`| | Reported | OLD | NEW-shown | NEW-wide | EXP calendar-day (not shipped) |`);
  p('|---|---:|---:|---:|---:|---:|');
  const R = KINGS_ROAD.reported;
  const o = kr.out;
  p(`| Gross | ${gbp(R.gross)} | ${gbp(o.old.gross)} | ${gbp(o.shown.gross)} | ${gbp(o.wide.gross)} | ${gbp(o.cal.gross)} |`);
  p(`| Occupancy | ${pct(R.occupancy)} | ${pct(o.old.occupancy)} | ${pct(o.shown.occupancy)} | ${pct(o.wide.occupancy)} | ${pct(o.cal.occupancy)} |`);
  p(`| Nightly rate | ${gbp(R.adr)} | ${gbp(o.old.adr)} | ${gbp(o.shown.adr)} | ${gbp(o.wide.adr)} | ${gbp(o.cal.adr)} |`);
  p(`| Net (52% of gross) | ${gbp(R.net)} | ${gbp(o.old.net)} | ${gbp(o.shown.net)} | ${gbp(o.wide.net)} | ${gbp(o.cal.net)} |`);
  p();
  for (const k of ['shown', 'wide']) {
    const m = kr.out[k].meta;
    if (!m) continue;
    p(`- ${k === 'shown' ? 'NEW-shown' : 'NEW-wide'}: path=${m.path}, full-time comps=${m.fullTimeComps} (by months ${m.fullTimeByRevenueMonths}, operator-only ${m.fullTimeByOperatorOnly}) of ${m.compsConsidered}; ${m.subjectAdjustment.reason}; occupancy ${m.occupancySource}; ceiling £${m.ceiling.value?.toLocaleString('en-GB')} (${m.ceiling.source}) ${m.ceiling.applied ? `applied (was £${m.ceiling.preCeilingRevenue.toLocaleString('en-GB')})` : 'not reached'}.`);
  }
  p();
}

p('## Caveats');
p();
p('- "Actual" is Airbnb-only revenue (annual_revenue_ltm); operators who also sell on other platforms earn more than this.');
p('- The same full-time rule picks the test subjects and NEW\'s comp pool, which favours NEW.');
p('- Each hidden comp keeps its real guest count, not our bedrooms × 2 + 2 sofa-bed setup.');
p(`- Airbtics' monthly series ends ${monthlyMax}, months before the reports were created, so the "10 of the last 12 months" test looks at an older window than annual_revenue_ltm.`);
p();
if (worseArea.length || worseClass.length || worseBeds.length) {
  p(`Segments (n ≥ 10) where ${winnerLabel} is materially worse than OLD (≥${MATERIAL * 100} points on ±25% share or median abs error): ${[...worseArea.map((x) => `area ${x}`), ...worseClass.map((x) => x), ...worseBeds.map((x) => `${x}-bed`)].join(', ')}.`);
} else {
  p(`No segment with n ≥ 10 where ${winnerLabel} is materially worse than OLD.`);
}

const md = lines.join('\n') + '\n';
process.stdout.write(md);
writeFileSync(join(DATA, 'results.md'), md);
writeFileSync(join(DATA, 'results.json'), JSON.stringify({ overall, winner, kingsRoad: kr, rows }, null, 1));
