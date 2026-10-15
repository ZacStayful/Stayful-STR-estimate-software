#!/usr/bin/env node
/**
 * Score the income model against our own properties' real revenue, OLD vs NEW.
 *
 *   npm run backtest:actuals [-- --data <dir>]
 *   (= node --import ./scripts/register-test-resolver.mjs scripts/actuals-backtest.mjs)
 *
 * Inputs, both produced beforehand and both gitignored:
 *   <data>/uplisting/actuals.json   from scripts/uplisting-actuals.mjs
 *   <data>/reports/<cache_key>.json from scripts/backtest-fetch.mjs --keys …
 * <data> defaults to scripts/.backtest-data. Makes NO network calls.
 *
 * For each property with a saved Airbtics report it runs the real
 * comp-to-revenue function (buildDataFromReportComps in
 * src/lib/apis/airbtics.ts) the way the analyser would for that property:
 * guests = bedrooms × 2 + 2, lat/lng from the report, no optional inputs.
 *
 *   OLD  model 'legacy'    — what production did before PR #18
 *   NEW  model 'fulltime'  — PR #18 (default full-time scope)
 *   EXP  calendar-day experiment from scripts/backtest.mjs (not shipped)
 *
 * error = (predicted − actual) / actual, where actual is accommodation revenue
 * over the 365-night window (no cleaning, no taxes). Airbtics revenue includes
 * cleaning fees, so the same metrics are also reported against accommodation +
 * cleaning. Properties live less than 12 months are scored separately, against
 * their annualised revenue, and are left out of the headline numbers.
 *
 * Output: markdown on stdout, plus <data>/actuals-results.{md,json}.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataFromReportComps, classifyLocation } from '../src/lib/apis/airbtics.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const argIndex = process.argv.indexOf('--data');
const DATA = argIndex === -1 ? join(HERE, '.backtest-data') : process.argv[argIndex + 1];
const silent = () => {};

const VERSIONS = [
  { key: 'old', label: 'OLD', run: { model: 'legacy' } },
  { key: 'new', label: 'NEW', run: { model: 'fulltime' } },
  { key: 'exp', label: 'EXP', run: { model: 'fulltime' }, calendar: true },
];

// Kept identical to toCalendarDays in scripts/backtest.mjs (that file runs on
// import, so it can't be imported from here): re-expresses each comp's
// occupancy over 365 days, i.e. RevPAR = annual revenue / 365.
function toCalendarDays(comps) {
  return comps.map((c) => {
    const adr = c.avg_booked_daily_rate_ltm ?? 0;
    const perDay = (c.annual_revenue_ltm ?? 0) / 365;
    return { ...c, avg_occupancy_rate_ltm: adr > 0 ? Math.min(100, (perDay / adr) * 100) : 0 };
  });
}

// ── Metrics (same definitions as scripts/backtest.mjs) ───────────

const median = (xs) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function metrics(errs) {
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

const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '–');
const signed = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%` : '–');
const gbp = (v) => (Number.isFinite(v) ? `£${Math.round(v).toLocaleString('en-GB')}` : '–');
const area = (postcode) => (postcode ?? '').split(' ')[0] || '?';

// ── Load ──────────────────────────────────────────────────────────

const actualsPath = join(DATA, 'uplisting', 'actuals.json');
if (!existsSync(actualsPath)) {
  console.error(`No ${actualsPath}. Run scripts/uplisting-actuals.mjs first.`);
  process.exit(1);
}
const actuals = JSON.parse(readFileSync(actualsPath, 'utf8'));

function loadReport(cacheKey) {
  const file = join(DATA, 'reports', `${cacheKey}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).report : null;
}

const scored = [];
const noReport = [];
const unmatchable = [];
const noRevenue = [];

for (const p of actuals.properties) {
  if (!(p.revenue > 0) || !(p.nights > 0)) {
    noRevenue.push(p);
    continue;
  }
  if (!p.cacheKey || !p.bedrooms) {
    unmatchable.push(p);
    continue;
  }
  const report = loadReport(p.cacheKey);
  if (!report) {
    noReport.push(p);
    continue;
  }
  const lat = report.latitude;
  const lng = report.longitude;
  const locationClass = classifyLocation(p.postcode);
  const actual = p.fullYear ? p.revenue : p.revenueAnnualised;
  const actualClean = p.fullYear ? p.revenue + p.cleaning : ((p.revenue + p.cleaning) * 365) / p.daysLive;
  const row = { ...p, actual, actualClean, locationClass, reportId: report.id, compCount: report.comps?.length ?? 0, pred: {}, occ: {}, adrPred: {}, path: {}, err: {}, errClean: {} };
  for (const v of VERSIONS) {
    const input = v.calendar ? { ...report, comps: toCalendarDays(report.comps ?? []) } : report;
    const r = buildDataFromReportComps(input, p.bedrooms, p.guests, lat, lng, locationClass, p.postcode, {}, { ...v.run, log: silent });
    row.pred[v.key] = r.data.annualRevenue;
    row.occ[v.key] = r.data.occupancyRate;
    row.adrPred[v.key] = r.data.averageDailyRate;
    row.path[v.key] = r.data.incomeModel?.path ?? (v.key === 'old' ? 'legacy' : 'no_comps');
    row.err[v.key] = (r.data.annualRevenue - actual) / actual;
    row.errClean[v.key] = (r.data.annualRevenue - actualClean) / actualClean;
  }
  scored.push(row);
}

// A property with no check-out in the last weeks of the window stopped trading
// part-way (paused, left management), so its year isn't a fair test either.
const headline = scored.filter((r) => r.fullYear && !r.possiblyPaused);
const partYear = scored.filter((r) => !r.fullYear && !r.possiblyPaused);
const pausedScored = scored.filter((r) => r.possiblyPaused);
const summary = (rows, field) => Object.fromEntries(VERSIONS.map((v) => [v.key, metrics(rows.map((r) => r[field][v.key]))]));
const overall = summary(headline, 'err');
const overallClean = summary(headline, 'errClean');
const overallPart = summary(partYear, 'err');

// ── Report ────────────────────────────────────────────────────────

const lines = [];
const p = (s = '') => lines.push(s);

p('# Income estimate vs our real revenue');
p();
p(`Window: ${actuals.window.from} → ${actuals.window.to} (365 nights). Actual = accommodation revenue from Uplisting, excluding cleaning fees and taxes.`);
p();
p(`Scored: **${headline.length}** propert${headline.length === 1 ? 'y' : 'ies'} live all year${partYear.length ? ` (+${partYear.length} live under 12 months, scored separately)` : ''}.`);
p();

function summaryTable(m) {
  p('| | within ±15% | within ±25% | typical miss | average bias |');
  p('|---|---:|---:|---:|---:|');
  for (const v of VERSIONS) {
    const x = m[v.key];
    p(`| ${v.label} | ${pct(x.within15)} | ${pct(x.within25)} | ${pct(x.medianAbsErr)} | ${signed(x.meanBias)} |`);
  }
  p();
}

if (headline.length > 0) {
  p('## Summary (live all year)');
  p();
  summaryTable(overall);
  p('"Typical miss" is the median error ignoring direction. "Average bias" is the mean signed error: + means the estimate is too high.');
  p();
  p('Same properties with cleaning fees counted as income (closer to how Airbtics measures revenue):');
  p();
  summaryTable(overallClean);
}

function block(r, actualLabel) {
  const parts = VERSIONS.map((v) => `${v.label} ${gbp(r.pred[v.key])} (${signed(r.err[v.key])})`);
  p(`- **${r.name}** (${r.bedrooms} bed, ${area(r.postcode)})`);
  p(`  ${actualLabel} ${gbp(r.actual)} · ${pct(r.fullYear ? r.occupancy365 : r.occupancyLive)} occupied · ${gbp(r.adr)}/night`);
  p(`  ${parts.join(' · ')}`);
  p(`  NEW assumed ${pct(r.occ.new)} occupied at ${gbp(r.adrPred.new)}/night (path: ${r.path.new})`);
}

if (headline.length > 0) {
  p('## Per property (live all year)');
  p();
  for (const r of [...headline].sort((a, b) => Math.abs(b.err.new) - Math.abs(a.err.new))) block(r, 'Actual');
  p();
}

if (partYear.length > 0) {
  p('## Live under 12 months (not in the summary)');
  p();
  p('Actual is scaled up to a year from the days since the first booking, so seasonality can skew it.');
  p();
  summaryTable(overallPart);
  for (const r of partYear) block(r, `Live since ${r.liveSince}, annualised`);
  p();
}

if (pausedScored.length > 0) {
  p('## Possibly paused or left (not in the summary)');
  p();
  p('No check-out in the last 45 days of the window, so these did not trade the whole year.');
  p();
  for (const r of pausedScored) block(r, `Last check-out ${r.lastCheckOut}. Actual${r.fullYear ? '' : ' (annualised)'}`);
  p();
}

if (noReport.length > 0) {
  p('## No Airbtics report on file');
  p();
  p(`${noReport.length} propert${noReport.length === 1 ? 'y needs' : 'ies need'} a new report (~£0.50 each, ~£${(noReport.length * 0.5).toFixed(2)} total):`);
  p();
  for (const x of noReport) p(`- ${x.name}: ${x.cacheKey}`);
  p();
}

if (unmatchable.length > 0 || noRevenue.length > 0) {
  p('## Not scored');
  p();
  for (const x of unmatchable) p(`- ${x.name}: no usable postcode/bedrooms in Uplisting (postcode "${x.postcodeRaw ?? ''}", beds ${x.bedrooms ?? '—'})`);
  for (const x of noRevenue) p(`- ${x.name}: no paid nights in the window`);
  p();
}

p('## Caveats');
p();
p(`- Small sample (${headline.length} properties): one or two odd properties move the percentages a lot.`);
p('- Estimates use no optional inputs (parking, finish, outdoor space, special features), so feature uplifts are not applied.');
p('- Actuals include every channel (Airbnb, Booking.com, direct); the comps are Airbnb-only.');
p('- Airbtics revenue includes cleaning and service fees; see the second summary table.');

const md = lines.join('\n') + '\n';
process.stdout.write(md);
writeFileSync(join(DATA, 'actuals-results.md'), md);
writeFileSync(
  join(DATA, 'actuals-results.json'),
  JSON.stringify({ window: actuals.window, overall, overallClean, overallPart, scored, noReport: noReport.map((x) => ({ name: x.name, cacheKey: x.cacheKey })), unmatchable: unmatchable.map((x) => x.name), noRevenue: noRevenue.map((x) => x.name) }, null, 1),
);
