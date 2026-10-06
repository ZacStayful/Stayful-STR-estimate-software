import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePropertyType } from './propertyType.ts';

test('address wording wins: a flat is a flat whatever the caller guessed', () => {
  assert.deepEqual(resolvePropertyType('Flat 4, 4 Pritchard Street', 'Detached'), { type: 'Flat', source: 'address' });
  assert.deepEqual(resolvePropertyType('Apartment 12, Mill Lane', null), { type: 'Flat', source: 'address' });
});

test('caller guess is used when the address does not say', () => {
  assert.deepEqual(resolvePropertyType('42 Glenegals Road, CV2 3BP', 'Terraced'), { type: 'Terraced', source: 'caller' });
  assert.deepEqual(resolvePropertyType('42 Glenegals Road', 'semi detached'), { type: 'Semi-detached', source: 'caller' });
});

test('unknown or missing guess falls back to Flat', () => {
  assert.deepEqual(resolvePropertyType('42 Glenegals Road', 'bungalow'), { type: 'Flat', source: 'default' });
  assert.deepEqual(resolvePropertyType('RM12 4XF', undefined), { type: 'Flat', source: 'default' });
});

test('a street name containing a flat word as part of another word is not a flat', () => {
  assert.equal(resolvePropertyType('3 Unity Close', 'Terraced').type, 'Terraced');
});
