import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { lookupReport } from './report-lookup.ts';

// The /report lookup (app/api/get-report): the email must travel as a query variable (never pasted
// into the GraphQL text), only an exact email match may answer, and the report
// is read from the column the analyser uploads to (files__1), not "Call
// recordings" (file_mm1daxvv).

const ENV_KEYS = ['MONDAY_API_TOKEN', 'MONDAY_API_KEY', 'MONDAY_FILE_COLUMN_ID', 'MONDAY_EMAIL_COLUMN_ID', 'MONDAY_BOARD_ID'];
const savedEnv: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const realError = console.error;
const realLog = console.log;

type Sent = { query: string; variables: Record<string, unknown> };
let sent: Sent[] = [];
let items: unknown[] = [];

const lead = (email: string, files: unknown, recordings: unknown = null) => ({
  id: '1',
  name: 'A Lead',
  column_values: [
    { id: 'text_mkygb5xx', text: email, value: JSON.stringify(email) },
    { id: 'files__1', text: null, value: files === null ? null : JSON.stringify(files) },
    { id: 'file_mm1daxvv', text: null, value: recordings === null ? null : JSON.stringify(recordings) },
  ],
});

beforeEach(() => {
  sent = [];
  items = [];
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.MONDAY_API_TOKEN = 'test-token';
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ data: { boards: [{ items_page: { items } }] } }));
  }) as typeof fetch;
  console.error = () => {};
  console.log = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.log = realLog;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

test('a quote in the email cannot change the query', async () => {
  const typed = 'a@b.com"] }] }) { items { id name } } } #';
  await lookupReport(typed);

  assert.equal(sent.length, 1);
  assert.ok(!sent[0].query.includes('a@b.com'), 'the email must not be in the query text');
  assert.equal(sent[0].variables.email, typed.toLowerCase().trim());
});

test('it reads the reports column, not call recordings', async () => {
  await lookupReport('someone@example.com');

  const cols = sent[0].variables.cols as string[];
  assert.ok(cols.includes('files__1'));
  assert.ok(!cols.includes('file_mm1daxvv'));
});

test('part of an email never finds someone else', async () => {
  items = [lead('someone@gmail.com', { files: [{ name: 'r.pdf', url: 'https://example.com/r.pdf' }] })];
  const res = await lookupReport('@gmail.com');

  assert.equal(res.status, 404);
  assert.equal(res.body.leadName, undefined);
  assert.equal(res.body.fileUrl, undefined);
});

test('the exact email matches whatever its capitals', async () => {
  items = [lead('Someone@Example.com', { files: [{ name: 'r.pdf', url: 'https://example.com/r.pdf' }] })];
  const res = await lookupReport('someone@example.com');

  assert.equal(res.status, 200);
  assert.equal(res.body.fileUrl, 'https://example.com/r.pdf');
});

test('a file in call recordings is never handed out', async () => {
  items = [lead('someone@example.com', null, { files: [{ name: 'call.mp3', url: 'https://example.com/call.mp3' }] })];
  const res = await lookupReport('someone@example.com');

  assert.equal(res.status, 404);
  assert.equal(res.body.fileUrl, undefined);
});

test('no Monday credential answers 503 and sends nothing', async () => {
  delete process.env.MONDAY_API_TOKEN;
  const res = await lookupReport('someone@example.com');

  assert.equal(res.status, 503);
  assert.equal(sent.length, 0);
});

test('a missing or non-text email is refused before Monday is asked', async () => {
  assert.equal((await lookupReport(undefined)).status, 400);
  assert.equal((await lookupReport(42)).status, 400);
  assert.equal((await lookupReport('   ')).status, 400);
  assert.equal(sent.length, 0);
});
