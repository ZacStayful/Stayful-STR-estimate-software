import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecommendation,
  getLeadQualification,
  meetsShortLetCriteria,
  MARGIN_THRESHOLD,
  PROFIT_THRESHOLD_ANNUAL,
  MEDIUM_THRESHOLD,
} from './analysis.ts';

// True nets used by the decision (see getRecommendation):
//   trueSTRNet = gross × 0.44 − 5,904
//   trueLLNet  = rent × 12 × 0.90
// Helper: the gross STR revenue that produces an exact true STR net.
const grossFor = (trueSTRNet: number) => (trueSTRNet + 5904) / 0.44;

test('thresholds are 40% uplift, £20k/yr gap, 30% medium', () => {
  assert.equal(MARGIN_THRESHOLD, 0.40);
  assert.equal(PROFIT_THRESHOLD_ANNUAL, 20000);
  assert.equal(MEDIUM_THRESHOLD, 0.30);
});

test('uplift ≥ 40% with a gap under £20k → SHORT_LET, qualified', () => {
  // Rent £1,500/mo → LL net £16,200. Gross £84,000 → STR net £31,056.
  // Gap £14,856 (< £20k), uplift 92% → short-let via the margin route.
  const r = getRecommendation(84_000, 1_500);
  assert.equal(Math.round(r.trueLLNet), 16_200);
  assert.equal(Math.round(r.trueSTRNet), 31_056);
  assert.ok(r.trueSTRNet - r.trueLLNet < PROFIT_THRESHOLD_ANNUAL);
  assert.ok(r.upliftPct >= MARGIN_THRESHOLD);
  assert.equal(r.recommendation, 'SHORT_LET');
  assert.equal(getLeadQualification(r.upliftPct, r.trueSTRNet - r.trueLLNet), 'qualified');
});

test('uplift < 40% but gap ≥ £20k → SHORT_LET, qualified (the £20k route)', () => {
  // Rent £5,000/mo → LL net £54,000. Gross £182,000 → STR net £74,176.
  // Gap £20,176, uplift ~37% → would have been LONG_LET on the margin alone.
  const r = getRecommendation(182_000, 5_000);
  assert.equal(Math.round(r.trueLLNet), 54_000);
  assert.equal(Math.round(r.trueSTRNet), 74_176);
  assert.ok(r.upliftPct < MARGIN_THRESHOLD, `uplift ${r.upliftPct} should be under the margin`);
  assert.ok(r.trueSTRNet - r.trueLLNet >= PROFIT_THRESHOLD_ANNUAL);
  assert.equal(r.recommendation, 'SHORT_LET');
  assert.equal(getLeadQualification(r.upliftPct, r.trueSTRNet - r.trueLLNet), 'qualified');
});

test('a gap of exactly £20,000 meets the bar (inclusive)', () => {
  // LL net £54,000; STR net £74,000 → gap exactly £20,000, uplift ~37%.
  const r = getRecommendation(grossFor(74_000), 5_000);
  assert.equal(Math.round(r.trueSTRNet - r.trueLLNet), 20_000);
  assert.ok(r.upliftPct < MARGIN_THRESHOLD);
  assert.equal(r.recommendation, 'SHORT_LET');
});

test('the gap is compared on rounded pounds, matching what the landlord sees', () => {
  assert.equal(meetsShortLetCriteria(0.1, 19_999.6), true);   // displays as £20,000
  assert.equal(meetsShortLetCriteria(0.1, 19_999.4), false);  // displays as £19,999
});

test('uplift < 40% and gap < £20k → LONG_LET; band follows the 30% medium line', () => {
  // LL net £54,000; STR net £72,000 → gap £18,000, uplift ~33% → medium.
  const medium = getRecommendation(grossFor(72_000), 5_000);
  assert.equal(medium.recommendation, 'LONG_LET');
  assert.ok(medium.upliftPct >= MEDIUM_THRESHOLD && medium.upliftPct < MARGIN_THRESHOLD);
  assert.equal(getLeadQualification(medium.upliftPct, medium.trueSTRNet - medium.trueLLNet), 'medium');

  // LL net £54,000; STR net £60,000 → gap £6,000, uplift ~11% → unqualified.
  const weak = getRecommendation(grossFor(60_000), 5_000);
  assert.equal(weak.recommendation, 'LONG_LET');
  assert.ok(weak.upliftPct < MEDIUM_THRESHOLD);
  assert.equal(getLeadQualification(weak.upliftPct, weak.trueSTRNet - weak.trueLLNet), 'unqualified');
});

test('uplift between 40% and 50% is now SHORT_LET (margin moved down from 50%)', () => {
  // LL net £16,200; STR net £23,500 → gap £7,300, uplift ~45%.
  const r = getRecommendation(grossFor(23_500), 1_500);
  assert.ok(r.upliftPct >= 0.40 && r.upliftPct < 0.50, `uplift ${r.upliftPct}`);
  assert.ok(r.trueSTRNet - r.trueLLNet < PROFIT_THRESHOLD_ANNUAL);
  assert.equal(r.recommendation, 'SHORT_LET');
  assert.equal(getLeadQualification(r.upliftPct, r.trueSTRNet - r.trueLLNet), 'qualified');
});

test('a negative gap is never short-let, whatever the uplift maths says', () => {
  // STR net below LL net → uplift negative, gap negative.
  const r = getRecommendation(grossFor(40_000), 5_000);
  assert.ok(r.upliftPct < 0);
  assert.equal(r.recommendation, 'LONG_LET');
  assert.equal(getLeadQualification(r.upliftPct, r.trueSTRNet - r.trueLLNet), 'unqualified');
});
