import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPostcodeArea } from './postcode.ts';

test('extracts a two-letter area from a full address', () => {
  assert.equal(extractPostcodeArea('123 Example St, Nottingham NG1 5GB'), 'NG');
});

test('extracts a single-letter London-style area', () => {
  assert.equal(extractPostcodeArea('E11 3LQ'), 'E');
});

test('extracts area from a bare postcode with no space', () => {
  assert.equal(extractPostcodeArea('LE16AA'), 'LE');
});

test('uppercases the captured area', () => {
  assert.equal(extractPostcodeArea('flat 2, m1 1ae'), 'M');
});

test('handles longer outward codes (letter suffix)', () => {
  assert.equal(extractPostcodeArea('EC1A 1BB'), 'EC');
});

test('returns null when no postcode is present', () => {
  assert.equal(extractPostcodeArea('123 Example Street, Some Town'), null);
});

test('returns null for a malformed / partial postcode', () => {
  assert.equal(extractPostcodeArea('NG1'), null);
});

test('returns null for empty input', () => {
  assert.equal(extractPostcodeArea(''), null);
});
