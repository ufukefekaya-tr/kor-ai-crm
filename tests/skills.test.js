// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculate, getTime} from '../skills/local.js';
test('local arithmetic handles precedence, functions, scientific numbers and percentages', () => {
  assert.equal(calculate('2+3*4'), 14);
  assert.equal(calculate('2^3^2'), 512);
  assert.equal(calculate('-2^2'), -4);
  assert.equal(calculate('max(10, 3^2)+sqrt(16)'), 14);
  assert.equal(calculate('20% * 8500'), 1700);
  assert.equal(calculate('2e3 + 5'), 2005);
});
test('local arithmetic rejects dynamic code, invalid domains and excessive nesting', () => {
  for (const input of ['process.exit()', 'constructor.constructor(1)', '1/0', 'sqrt(-1)', 'min()', '1 2', '2**3', 'abs(1,2)', '9'.repeat(513), '('.repeat(40)+'1'+')'.repeat(40), '-'.repeat(40)+'1']) assert.throws(() => calculate(input), undefined, input);
});
test('time utility accepts explicit clocks and validates timezones', () => {
  assert.equal(getTime('UTC', '2026-01-01T12:00:00Z').iso, '2026-01-01T12:00:00.000Z');
  assert.match(getTime('Europe/Istanbul', '2026-01-01T12:00:00Z').local, /15:00:00/);
  assert.throws(() => getTime('Invalid/Zone'));
});
test('skill catalog is provenance only and includes no runtime credentials', () => {
  const items = JSON.parse(readFileSync(new URL('../skills/catalog.json', import.meta.url)));
  assert.equal(items.length, 32);
  assert.equal(new Set(items.map(item => item.id)).size, 32);
  assert.equal(items.filter(item => item.status === 'local-library').length, 2);
  assert.equal(items.filter(item => item.status === 'replaced-by-crm').length, 2);
  for (const item of items) { assert.match(item.source.sha256, /^[a-f0-9]{64}$/); assert.ok(!('execute' in item)); }
});
