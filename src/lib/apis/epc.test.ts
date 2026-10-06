import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickCertificate, findField, mapEpcType, lookupEpcPropertyType, type EpcSearchRow } from './epc.ts';

const rows: EpcSearchRow[] = [
  { addressLine1: '40 Gleneagles Road', certificateNumber: 'A', postcode: 'CV2 3BP', registrationDate: '2019-01-01' },
  { addressLine1: '42 Gleneagles Road', certificateNumber: 'B-old', postcode: 'CV2 3BP', registrationDate: '2012-03-01' },
  { addressLine1: '42 Gleneagles Road', certificateNumber: 'B-new', postcode: 'CV2 3BP', registrationDate: '2021-06-01' },
  { addressLine1: 'Flat 2', addressLine2: '44 Gleneagles Road', certificateNumber: 'C', postcode: 'CV2 3BP', registrationDate: '2020-01-01' },
];

test('matches the right house and takes the newest certificate', () => {
  assert.equal(pickCertificate('42 Gleneagles Road, CV2 3BP', 'CV2 3BP', rows)?.certificateNumber, 'B-new');
});

test('a misspelt street still matches when the number is a single home in the postcode', () => {
  assert.equal(pickCertificate('42 Glenegals Road, CV2 3BP', 'CV2 3BP', rows)?.certificateNumber, 'B-new');
});

test('never takes a flat inside the building for the whole house, or a neighbour', () => {
  assert.equal(pickCertificate('44 Gleneagles Road', 'CV2 3BP', rows), null);
  assert.equal(pickCertificate('46 Gleneagles Road', 'CV2 3BP', rows), null);
});

test('postcode-only leads have no single property to match', () => {
  assert.equal(pickCertificate('CV2 3BP', 'CV2 3BP', rows), null);
});

test('finds fields anywhere in a schema-free certificate, any key style', () => {
  const cert = { data: { assessment: { 'property-type': 'House', builtForm: 'Mid-Terrace' } } };
  assert.equal(findField(cert, ['property_type']), 'House');
  assert.equal(findField(cert, ['built_form']), 'Mid-Terrace');
  assert.equal(findField(cert, ['nothing_here']), null);
});

test('maps words and RdSAP codes to the four calculator types', () => {
  assert.equal(mapEpcType('Flat', null), 'Flat');
  assert.equal(mapEpcType('Maisonette', 'Mid-Terrace'), 'Flat');
  assert.equal(mapEpcType('House', 'Semi-Detached'), 'Semi-detached');
  assert.equal(mapEpcType('House', 'Detached'), 'Detached');
  assert.equal(mapEpcType('Bungalow', 'End-Terrace'), 'Terraced');
  assert.equal(mapEpcType('0', '2'), 'Semi-detached');
  assert.equal(mapEpcType('2', '4'), 'Flat');
  assert.equal(mapEpcType('Semi-detached house', null), 'Semi-detached');
  assert.equal(mapEpcType('Mid-terrace house', ''), 'Terraced');
  assert.equal(mapEpcType('0', null), null); // house code but unknown form: let the next source decide
  assert.equal(mapEpcType('House', null), null);
});

test('end to end with a fake register: Bearer header, search then certificate', async () => {
  process.env.EPC_API_KEY = 'Bearer abc123';
  const seen: Array<{ url: string; auth: string }> = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    seen.push({ url, auth: String((init?.headers as Record<string, string>).Authorization) });
    const body = url.includes('/api/domestic/search')
      ? { data: rows, pagination: {} }
      : { data: { property_type: 'House', built_form: 'Semi-Detached' } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const result = await lookupEpcPropertyType('42 Glenegals Road', 'CV2 3BP', fakeFetch);
  assert.equal(result?.type, 'Semi-detached');
  assert.equal(result?.certificateNumber, 'B-new');
  assert.equal(seen[0].auth, 'Bearer abc123');
  assert.match(seen[0].url, /\/api\/domestic\/search\?postcode=CV2%203BP/);
  assert.match(seen[1].url, /\/api\/certificate\?certificate_number=B-new/);
});

test('no key, a failing register or a 404 all return null without throwing', async () => {
  delete process.env.EPC_API_KEY;
  assert.equal(await lookupEpcPropertyType('42 Gleneagles Road', 'CV2 3BP'), null);
  process.env.EPC_API_KEY = 'abc';
  const boom = async () => { throw new Error('network down'); };
  assert.equal(await lookupEpcPropertyType('42 Gleneagles Road', 'CV2 3BP', boom), null);
  const notFound = async () => new Response('{"error":"No certificates could be found"}', { status: 404 });
  assert.equal(await lookupEpcPropertyType('42 Gleneagles Road', 'CV2 3BP', notFound), null);
  delete process.env.EPC_API_KEY;
});
