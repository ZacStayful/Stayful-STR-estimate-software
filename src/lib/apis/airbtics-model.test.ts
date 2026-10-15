import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataFromReportComps } from './airbtics.ts';
import { SCENARIOS } from './__fixtures__/report-comps.ts';

// Golden outputs captured from buildDataFromReportComps BEFORE the full-time
// income model was added (commit "Export comp-to-revenue logic for offline
// use"). The legacy model must keep reproducing them exactly — this is what
// lets the backtest's OLD column stand for what production does today.
const GOLDEN = JSON.parse(
  readFileSync(new URL('./__fixtures__/legacy-golden.json', import.meta.url), 'utf8'),
);

const silent = () => {};

for (const s of SCENARIOS) {
  test(`legacy model reproduces the pre-change output: ${s.name}`, () => {
    const result = buildDataFromReportComps(
      s.report, s.bedrooms, s.guests, s.lat, s.lng, s.locationClass, s.postcode, s.options,
      { log: silent },
    );
    assert.deepEqual(JSON.parse(JSON.stringify(result)), GOLDEN[s.name]);
  });
}
