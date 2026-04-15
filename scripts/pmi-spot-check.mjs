#!/usr/bin/env node
/**
 * PMI V4 algorithm spot-check.
 *
 * Reimplements the core aggregation math from src/lib/apis/airbtics.ts
 * (buildDataFromReportComps V4 pipeline, Stage 3) as pure JS and runs
 * it against 8 hand-transcribed PMI reports. Prints per-case error
 * and an overall summary.
 *
 * Why duplicate the math instead of importing the TS code? The
 * project has no tsx/ts-node, so running TS directly from a .mjs
 * script is not supported. The duplication is acceptable because:
 *  (a) this script is a one-shot validation tool, not production
 *      code, and (b) the rule constants below mirror pmi-rules.ts
 *      exactly — drift will show up as per-case errors.
 *
 * RUN:   node scripts/pmi-spot-check.mjs
 * EXIT:  0 if ≥6/8 within ±10%, 1 otherwise
 */

// ─── Constants (MUST MATCH src/lib/apis/pmi-rules.ts) ──────────────
const BED_GAP_BOOST_PER_BED = 0.15;
const GUEST_GAP_SHRINK_THRESHOLD = -1;
const GUEST_GAP_SHRINK_DAMP = 0.5;
const COASTAL_SMALL_BED_THRESHOLD = 2;
const OUTLIER_ADR_MULTIPLIER = 3.0;
const OUTLIER_REVENUE_MULTIPLIER = 2.0;
const OUTLIER_DISTANCE_MULTIPLIER = 5.0;
const MIN_COMPS_FOR_AGGREGATION = 6;
const TOP_N_FOR_COMPRESSED_PREMIUM = 8;
const COMPRESSED_PREMIUM = new Set(['EH1', 'EH2', 'OX1', 'BA1']);
const COASTAL_OCC = { 0: 0.68, 1: 0.78, 2: 0.62, 3: 0.53, 4: 0.56, 5: 0.52 };
const RURAL_LEISURE_OCC = { 0: 0.65, 1: 0.71, 2: 0.65, 3: 0.60, 4: 0.56, 5: 0.54 };

// ─── Helpers ───────────────────────────────────────────────────────
const median = (xs) => {
  const s = [...xs].filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const outward = (pc) => (pc || '').trim().toUpperCase().split(/\s+/)[0] || '';
const isPremium = (pc) => COMPRESSED_PREMIUM.has(outward(pc));
const typicalOcc = (locClass) => {
  if (locClass === 'coastal') return COASTAL_OCC;
  if (locClass === 'rural_village' || locClass === 'rural_isolated') return RURAL_LEISURE_OCC;
  return null;
};
const clampBeds = (b) => Math.max(0, Math.min(5, Math.round(b)));

// ─── V4 pipeline (mirrors airbtics.ts Step 5a-5g) ──────────────────
function predictV4(subject, comps) {
  // 5a: pool medians
  const adrs = comps.map(c => c.adr);
  const revs = comps.map(c => c.revenue);
  const dists = comps.map(c => c.distanceMi);
  const mAdr = median(adrs), mRev = median(revs), mDist = median(dists);

  // 5b: outlier filter
  const filtered = comps.filter(c => {
    const adrOut = mAdr > 0 && c.adr > OUTLIER_ADR_MULTIPLIER * mAdr && mRev > 0 && c.revenue > OUTLIER_REVENUE_MULTIPLIER * mRev;
    const distOut = mDist > 0 && c.distanceMi > OUTLIER_DISTANCE_MULTIPLIER * mDist;
    return !adrOut && !distOut;
  });
  const effective = filtered.length >= MIN_COMPS_FOR_AGGREGATION ? filtered : comps;

  // 5c: per-comp RevPAR
  const revpars = effective.map(c => c.adr * (c.occ / 100)).filter(v => v > 0);

  // 5d: aggregate (top-8 if compressed premium, mean if coastal-small, else median)
  let target, method;
  if (isPremium(subject.postcode)) {
    const topN = [...revpars].sort((a, b) => b - a).slice(0, TOP_N_FOR_COMPRESSED_PREMIUM);
    target = topN.length ? topN.reduce((s, v) => s + v, 0) / topN.length : 0;
    method = `top${TOP_N_FOR_COMPRESSED_PREMIUM}mean`;
  } else if (subject.locationClass === 'coastal' && subject.bedrooms <= COASTAL_SMALL_BED_THRESHOLD) {
    target = revpars.length ? revpars.reduce((s, v) => s + v, 0) / revpars.length : 0;
    method = 'coastalSmallMean';
  } else {
    target = median(revpars);
    method = 'median';
  }

  // 5e: subject-vs-pool adjustments
  const mBeds = median(effective.map(c => c.bedrooms));
  const mGuests = median(effective.map(c => c.guests));
  const bedGap = subject.bedrooms - mBeds;
  const guestGap = subject.guests - mGuests;
  let factor = 1, reason = 'none';
  if (bedGap >= 1 && guestGap >= 0) {
    factor = 1 + BED_GAP_BOOST_PER_BED * bedGap;
    reason = `bed+${bedGap}`;
  } else if (guestGap <= GUEST_GAP_SHRINK_THRESHOLD && mGuests > 0 && !isPremium(subject.postcode)) {
    // Damped shrink: 1 - DAMP × (1 - ratio). Pulls half-way back toward 1.0.
    const rawRatio = subject.guests / mGuests;
    factor = 1 - GUEST_GAP_SHRINK_DAMP * (1 - rawRatio);
    reason = `guest${guestGap}_damped`;
  } else if (guestGap <= GUEST_GAP_SHRINK_THRESHOLD && isPremium(subject.postcode)) {
    reason = `guest${guestGap}_skipped(premium)`;
  }
  const adjusted = target * factor;

  // 5f: derive occupancy
  const table = typicalOcc(subject.locationClass);
  let occ, occSrc;
  if (table) {
    occ = table[clampBeds(subject.bedrooms)] ?? 0.60;
    occSrc = `table:${subject.locationClass}`;
  } else {
    occ = median(effective.map(c => c.occ / 100));
    if (!(occ > 0)) occ = 0.60;
    occSrc = 'compmedian';
  }

  // 5g: split
  const adr = occ > 0 ? adjusted / occ : 0;
  const predRev = adjusted * 365;

  return { target, adjusted, occ, adr, predRev, method, reason, occSrc, bedGap, guestGap, mBeds, mGuests, droppedByFilter: comps.length - filtered.length };
}

// ─── Test cases (8 most diagnostic of 33 PMI samples) ──────────────
// Comp order: [bedrooms, guests, distanceMi, availDays (unused), occ%, ADR, revenue]
const make = (arr) => arr.map(([b, g, d, a, o, adr, rev]) => ({ bedrooms: b, guests: g, distanceMi: d, availDays: a, occ: o, adr, revenue: rev }));

const CASES = [
  { name: 'Sheffield S1 4LG (1b/3g) - baseline median',
    subject: { bedrooms: 1, guests: 3, postcode: 'S1 4LG', locationClass: 'urban' },
    pmi: { rev: 24421, adr: 87, occ: 77 },
    comps: make([
      [1,3,0.27,182,74,71,9549],[1,3,0.27,126,82,74,7635],[1,3,0.27,308,70,140,30250],
      [1,3,0.27,259,80,77,15949],[1,3,0.27,336,67,80,18242],[1,3,0.27,126,55,135,9230],
      [1,3,0.27,238,77,146,26809],[1,3,0.27,126,45,157,8704],[1,3,0.27,161,47,151,11205],
      [1,3,0.27,98,24,143,3443],[1,3,0.27,252,62,103,15949],[1,3,0.27,147,50,108,7807],
    ]) },
  { name: 'Edinburgh EH1 1BS (4b/9g) - COMPRESSED PREMIUM',
    subject: { bedrooms: 4, guests: 9, postcode: 'EH1 1BS', locationClass: 'urban' },
    pmi: { rev: 181793, adr: 671, occ: 73 },
    comps: make([
      [4,10,0.03,329,60,672,136880],[4,10,0.03,336,55,722,134884],[4,8,0.03,301,73,678,148605],
      [4,8,0.02,357,78,682,185439],[5,10,0.01,308,73,725,164604],[4,10,0.09,308,65,583,117577],
      [4,8,0.05,336,77,724,178289],[4,10,0.12,259,56,578,80533],[4,8,0.15,210,56,1025,123367],
      [3,10,0.15,182,54,531,52813],[3,10,0.12,91,54,267,12876],[3,8,0.11,308,59,526,93732],
    ]) },
  { name: 'Derby DE1 (5b/10g) - standard median',
    subject: { bedrooms: 5, guests: 10, postcode: 'DE1', locationClass: 'urban' },
    pmi: { rev: 41566, adr: 174, occ: 66 },
    comps: make([
      [5,10,0.30,98,37,840,30179],[5,10,0.35,161,55,220,19916],[5,9,0.65,189,69,155,19968],
      [5,10,1.83,91,90,386,31731],[4,9,0.50,154,59,187,16849],[4,9,0.51,175,61,171,18427],
      [4,10,1.28,245,44,179,19024],[5,8,0.79,252,69,134,23196],[4,8,0.18,280,75,141,29330],
      [4,8,0.35,273,73,147,29396],[4,8,0.45,224,71,181,28762],[3,10,1.29,196,53,174,18282],
    ]) },
  { name: 'Broadstairs CT10 (4b/9g) - COASTAL LARGE',
    subject: { bedrooms: 4, guests: 9, postcode: 'CT10 2PU', locationClass: 'coastal' },
    pmi: { rev: 55808, adr: 273, occ: 56 },
    comps: make([
      [4,12,0.09,196,44,798,69827],[4,8,0.87,133,53,289,20448],[4,8,0.87,189,51,463,45247],
      [4,10,1.00,287,66,279,50569],[4,8,0.99,140,88,312,39192],[4,8,1.00,329,47,256,40948],
      [4,9,1.09,245,44,262,27795],[4,8,1.04,245,54,280,37672],[4,8,1.09,189,48,342,28147],
      [4,8,1.06,147,68,368,37166],[4,8,1.03,343,50,303,54008],[4,8,1.08,336,48,271,42910],
    ]) },
  { name: 'Broadstairs CT10 (1b/2g) - COASTAL SMALL',
    subject: { bedrooms: 1, guests: 2, postcode: 'CT10 2PU', locationClass: 'coastal' },
    pmi: { rev: 28488, adr: 98, occ: 80 },
    comps: make([
      [1,2,0.73,350,89,74,22583],[1,2,0.83,329,78,85,22092],[1,2,0.80,266,73,94,18191],
      [1,2,0.84,140,51,106,7426],[1,2,0.88,126,94,131,15483],[1,2,0.84,350,91,126,40326],
      [1,2,0.95,357,57,118,23877],[1,2,0.92,203,64,88,11365],[1,2,0.96,266,54,200,29433],
      [1,2,1.01,217,54,96,10934],[1,2,1.02,259,59,138,20075],[1,2,1.01,259,58,133,19963],
    ]) },
  { name: 'Glasgow G12 8RF (3b/3g) - GUEST-GAP SHRINK',
    subject: { bedrooms: 3, guests: 3, postcode: 'G12 8RF', locationClass: 'urban' },
    pmi: { rev: 46591, adr: 203, occ: 63 },
    comps: make([
      [2,3,0.11,252,54,226,31091],[3,4,0.54,224,66,219,32049],[2,3,0.36,161,84,136,18328],
      [3,5,0.09,210,63,345,45534],[3,5,0.20,308,66,257,52646],[3,5,0.32,210,81,266,45554],
      [2,4,0.09,308,71,197,41387],[2,4,0.03,210,68,207,28109],[2,4,0.07,98,65,248,16122],
      [2,4,0.07,175,78,138,19015],[2,4,0.06,315,74,199,46157],[2,4,0.09,189,63,228,26922],
    ]) },
  { name: 'Nottingham NG1 1GL (4b/10g) - BED-GAP BOOST',
    subject: { bedrooms: 4, guests: 10, postcode: 'NG1 1GL', locationClass: 'urban' },
    pmi: { rev: 61600, adr: 263, occ: 64 },
    comps: make([
      [4,10,0.12,189,30,490,27526],[3,10,0.19,133,32,134,5765],[5,10,0.27,329,48,269,40456],
      [3,10,0.24,161,74,281,33105],[4,10,0.32,126,70,265,23703],[4,10,0.33,343,70,274,64177],
      [3,10,0.33,357,66,225,52939],[4,9,0.33,147,56,138,11315],[4,9,0.29,315,53,141,23482],
      [4,9,0.38,294,81,156,37086],[4,8,0.35,112,38,180,7622],[3,9,0.38,329,69,204,45440],
    ]) },
  { name: 'Oxford OX1 (4b/10g) - COMPRESSED PREMIUM #2',
    subject: { bedrooms: 4, guests: 10, postcode: 'OX1 4UT', locationClass: 'urban' },
    pmi: { rev: 106358, adr: 416, occ: 70 },
    comps: make([
      [5,10,0.46,154,79,659,81025],[3,10,0.47,154,63,236,22435],[3,9,0.44,224,85,400,74894],
      [4,8,0.46,161,73,240,27934],[4,8,0.52,210,50,440,46500],[5,10,0.57,287,48,560,73780],
      [5,9,0.56,175,54,385,36493],[4,8,0.54,217,71,405,61787],[6,10,0.60,266,56,512,75741],
      [4,8,0.59,126,42,258,13551],[4,8,0.60,315,71,355,79270],[4,10,0.73,133,39,384,19502],
    ]) },
];

// ─── Runner ────────────────────────────────────────────────────────
console.log('PMI V4 spot-check — 8 diagnostic cases\n');
const pad = (s, n) => String(s).padEnd(n);
const fmt = (v) => new Intl.NumberFormat('en-GB').format(Math.round(v));

let withinFive = 0, withinTen = 0, withinFifteen = 0;
console.log(pad('Case', 46), pad('PMI', 10), pad('Pred', 10), pad('Err%', 8), pad('Method', 14), 'Notes');
console.log('─'.repeat(120));
for (const c of CASES) {
  const r = predictV4(c.subject, c.comps);
  const errPct = ((r.predRev - c.pmi.rev) / c.pmi.rev) * 100;
  const abs = Math.abs(errPct);
  if (abs <= 5) withinFive++;
  if (abs <= 10) withinTen++;
  if (abs <= 15) withinFifteen++;
  const mark = abs <= 5 ? '✓' : abs <= 10 ? '·' : abs <= 15 ? '!' : 'X';
  const notes = `${mark} droppedBy=${r.droppedByFilter} reason=${r.reason} occ=${r.occSrc}`;
  console.log(
    pad(c.name.slice(0, 44), 46),
    pad('£' + fmt(c.pmi.rev), 10),
    pad('£' + fmt(r.predRev), 10),
    pad((errPct >= 0 ? '+' : '') + errPct.toFixed(1) + '%', 8),
    pad(r.method, 14),
    notes
  );
}
console.log('─'.repeat(120));
console.log(`Within ±5%:  ${withinFive}/8`);
console.log(`Within ±10%: ${withinTen}/8`);
console.log(`Within ±15%: ${withinFifteen}/8`);
const passed = withinTen >= 6;
console.log(`\n${passed ? 'PASS' : 'FAIL'} (pass criterion: ≥6/8 within ±10%)`);
process.exit(passed ? 0 : 1);
