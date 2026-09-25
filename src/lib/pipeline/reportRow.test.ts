import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildReportRow,
  isUniqueViolation,
  saveReportRow,
  withoutStreetAddress,
  LEAD_DB_SOURCE,
  type ReportFigures,
} from './reportRow.ts';
import { fakeAnalysis } from '../bulk/fake.ts';
import { normaliseAnalysisInput, defaultGuests } from './input.ts';
import type { AnalysisResult } from '../types.ts';

function fixture(): AnalysisResult {
  const normalised = normaliseAnalysisInput({
    address: '12 Bourneside Road, Bristol',
    postcode: 'BS4 3AA',
    bedrooms: 3,
    guests: defaultGuests(3),
    longLetNotSure: true,
  });
  assert.equal(normalised.ok, true);
  if (!normalised.ok) throw new Error('unreachable');
  const result = fakeAnalysis(normalised.input);
  // Five decimal places, so rounding to two is visible.
  result.coordinates = { lat: 51.44321, lng: -2.55678 };
  return result;
}

const FIGURES: ReportFigures = {
  overview: { grossRevenue: 41000, netRevenue: 24000, valueConservative: 250000, valueUpper: 280000 },
};

// ── Every source except the lead database: exactly the row as before ───────

test('a live analyser row keeps the address, exact coordinates and the result itself', () => {
  const result = fixture();
  const row = buildReportRow(result, FIGURES, { email: 'lead@example.com', source: 'analyser' });

  assert.equal(row.address, '12 Bourneside Road, Bristol');
  assert.equal(row.postcode, 'BS4 3AA');
  assert.equal(row.postcode_area, 'BS');
  assert.equal(row.lat, 51.44321);
  assert.equal(row.lng, -2.55678);
  assert.equal(row.lead_email, 'lead@example.com');
  assert.equal(row.gross_revenue, 41000);
  assert.equal(row.source, 'analyser');
  // The same object, not a copy: the insert is unchanged for this source.
  assert.equal(row.raw_response, result);
});

test('no request id → no request_id column at all, so older schemas still accept the insert', () => {
  for (const requestId of [undefined, null, '', '   ']) {
    const row = buildReportRow(fixture(), FIGURES, { email: null, source: 'analyser', requestId });
    assert.equal('request_id' in row, false, `requestId ${JSON.stringify(requestId)}`);
  }
});

// ── The lead database: postcode, bedrooms and figures, never the street ────

test('a lead_db row drops the street address and rounds the coordinates', () => {
  const result = fixture();
  const row = buildReportRow(result, FIGURES, { email: null, source: LEAD_DB_SOURCE, requestId: 'row-1' });

  assert.equal(row.address, null);
  assert.equal(row.lat, 51.44);
  assert.equal(row.lng, -2.56);

  // What the Market Explorer reads is all still there.
  assert.equal(row.postcode, 'BS4 3AA');
  assert.equal(row.postcode_area, 'BS');
  assert.equal(row.bedrooms, 3);
  assert.equal(row.gross_revenue, 41000);
  assert.equal(row.net_revenue, 24000);
  assert.equal(row.adr, result.shortLet.averageDailyRate);
  assert.equal(row.request_id, 'row-1');

  const stored = row.raw_response as AnalysisResult;
  assert.equal(stored.property.address, 'BS4 3AA');
  assert.equal(stored.property.postcode, 'BS4 3AA');
  assert.deepEqual(stored.coordinates, { lat: 51.44, lng: -2.56 });
  assert.deepEqual(stored.shortLet.monthlyRevenue, result.shortLet.monthlyRevenue);
  assert.deepEqual(stored.longLet, result.longLet);
  assert.deepEqual(stored.dataQuality, result.dataQuality);
});

test('the full address never appears anywhere in a stored lead_db row', () => {
  const row = buildReportRow(fixture(), FIGURES, { email: null, source: LEAD_DB_SOURCE });
  assert.equal(JSON.stringify(row).includes('Bourneside'), false);
});

test('the caller’s result is never mutated — the customer’s PDF is rendered from it', () => {
  const result = fixture();
  const before = structuredClone(result);
  const row = buildReportRow(result, FIGURES, { email: null, source: LEAD_DB_SOURCE });

  assert.deepEqual(result, before);
  assert.notEqual(row.raw_response, result);
  assert.equal(result.property.address, '12 Bourneside Road, Bristol');
  assert.deepEqual(result.coordinates, { lat: 51.44321, lng: -2.55678 });
});

test('withoutStreetAddress copies rather than editing in place', () => {
  const result = fixture();
  const copy = withoutStreetAddress(result);
  assert.notEqual(copy.property, result.property);
  assert.notEqual(copy.coordinates, result.coordinates);
  assert.equal(copy.shortLet, result.shortLet);
});

test('the request id is trimmed', () => {
  const row = buildReportRow(fixture(), FIGURES, { email: null, source: LEAD_DB_SOURCE, requestId: '  row-2 ' });
  assert.equal(row.request_id, 'row-2');
});

// ── Saving: a retry of the same request reuses the first row ───────────────

interface Call {
  op: string;
  args: unknown[];
}

function fakeClient(insertResult: { data: unknown; error: unknown }, lookupResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      calls.push({ op: 'from', args: [table] });
      return {
        insert(row: unknown) {
          calls.push({ op: 'insert', args: [row] });
          return {
            select: () => ({ single: async () => insertResult }),
          };
        },
        select(cols: string) {
          calls.push({ op: 'select', args: [cols] });
          const chain = {
            eq(col: string, value: unknown) {
              calls.push({ op: 'eq', args: [col, value] });
              return chain;
            },
            maybeSingle: async () => lookupResult,
          };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

test('a clean insert returns the new id', async () => {
  const { client } = fakeClient({ data: { id: 'new-id' }, error: null });
  assert.equal(await saveReportRow(client, { source: 'analyser' }), 'new-id');
});

test('a duplicate request returns the row the first attempt stored', async () => {
  const { client, calls } = fakeClient(
    { data: null, error: { code: '23505', message: 'duplicate key' } },
    { data: { id: 'first-id' }, error: null },
  );
  const id = await saveReportRow(client, { source: LEAD_DB_SOURCE, request_id: 'row-1' });
  assert.equal(id, 'first-id');
  const eqs = calls.filter((c) => c.op === 'eq').map((c) => c.args);
  assert.deepEqual(eqs, [
    ['source', LEAD_DB_SOURCE],
    ['request_id', 'row-1'],
  ]);
});

test('a unique violation with no request id is a failure, not a lookup', async () => {
  const { client, calls } = fakeClient({ data: null, error: { code: '23505' } });
  assert.equal(await saveReportRow(client, { source: 'analyser' }), null);
  assert.equal(calls.some((c) => c.op === 'select'), false);
});

test('any other insert error returns null and never throws', async () => {
  const { client } = fakeClient({ data: null, error: { code: '42703', message: 'column does not exist' } });
  assert.equal(await saveReportRow(client, { source: LEAD_DB_SOURCE, request_id: 'row-1' }), null);
});

test('a client that throws is swallowed — a failed save must never break an estimate', async () => {
  const client = {
    from() {
      throw new Error('network down');
    },
  } as unknown as SupabaseClient;
  assert.equal(await saveReportRow(client, { source: 'analyser' }), null);
});

test('isUniqueViolation reads the Postgres code only', () => {
  assert.equal(isUniqueViolation({ code: '23505' }), true);
  assert.equal(isUniqueViolation({ code: '23503' }), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
});

// ── Wiring: the request id has to survive three hops to reach the insert ───
//
// Nothing above would notice one of these being dropped: the row builder would
// simply never see a request id, and retries would go back to storing the same
// property twice. So the hops are pinned on the real source files.

function source(relative: string): string {
  // Comments stripped, so an explanation can never satisfy the guard on its own.
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('the request id reaches the insert: route → runAnalysis (both paths) → persistAndSync', () => {
  const route = source('../../app/api/internal/analyse/route.tsx');
  const run = source('./runAnalysis.ts');
  const persist = source('./persist.ts');

  assert.match(route, /reportSource: 'lead_db',[\s\S]*?\brequestId,\s*\}\);/);
  assert.equal(run.match(/requestId: options\.requestId \?\? null,/g)?.length, 2);
  assert.match(persist, /buildReportRow\(result, reportData, \{[\s\S]*?requestId: opts\.requestId,/);
});
