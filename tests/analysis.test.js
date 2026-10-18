// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright 2026 Ufuk Efe Kaya
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVisit, createVisitAnalyzer, haversineKm, DEFAULT_ANALYSIS_CONFIG, resolveAnalysisConfig } from '../server/analysis.js';

const visit = (overrides = {}) => ({
  notes: 'Discussed the replacement component requirements and delivery schedule.',
  actionTaken: 'Sent proposal for 12 units',
  nextStep: 'Follow up with the purchasing team',
  outcome: 'proposal_sent',
  amount: 240,
  occurredAt: '2026-06-12T12:00:00Z',
  lat: 0,
  lng: 0,
  customerId: 'fictional-customer-a',
  repId: 'fictional-rep-a',
  durationMinutes: 25,
  ...overrides,
});

test('haversine accepts zero and numeric coordinates and rejects invalid inputs', () => {
  assert.equal(haversineKm(0, 0, 0, 0), 0);
  assert.ok(Math.abs(haversineKm('0', '0', 0, 1) - 111.195) < 0.01);
  assert.ok(Math.abs(haversineKm(0, 179.9, 0, -179.9) - 22.239) < 0.01);
  assert.ok(Number.isFinite(haversineKm(-90, 0, 90, 180)));
  for (const invalid of [null, undefined, '', ' ', false, Infinity, NaN, 'bad']) assert.equal(haversineKm(invalid, 0, 0, 0), null);
  assert.equal(haversineKm(91, 0, 0, 0), null);
  assert.equal(haversineKm(0, -181, 0, 0), null);
});

test('concrete recorded evidence improves quality and exposes its contributions', () => {
  const detailed = analyzeVisit(visit());
  const vague = analyzeVisit(visit({ notes: 'Visited.', actionTaken: '', nextStep: '', outcome: '', amount: 0 }));
  assert.equal(detailed.quality.score, 100);
  assert.equal(detailed.quality.status, 'complete');
  assert.ok(vague.quality.score < detailed.quality.score);
  assert.equal(detailed.quality.metrics.evidenceCount, 6);
  assert.equal(detailed.sales.stage, 'proposal');
  assert.ok(detailed.quality.reasons.some((s) => s.includes('unverified')));
});

test('affirmative sale detection respects negation and explicit lost outcomes', () => {
  const won = analyzeVisit(visit({ notes: 'Order received for 12 units.', actionTaken: '', nextStep: '', outcome: '' }));
  const negated = analyzeVisit(visit({ notes: 'No order received for 12 units.', actionTaken: '', nextStep: '', outcome: '' }));
  const cancelled = analyzeVisit(visit({ notes: 'Order received for 12 units.', outcome: 'cancelled' }));
  assert.equal(won.sales.stage, 'won');
  assert.notEqual(negated.sales.stage, 'won');
  assert.equal(cancelled.sales.stage, 'lost');
  assert.ok(won.sales.score > negated.sales.score);
  assert.equal(analyzeVisit(visit({ notes: 'No order last week. Order confirmed today.', outcome: '' })).sales.stage, 'won');
  for (const notes of ['Order confirmed next week.', 'Order received?', 'Sipariş alındı mı?', 'Order confirmed but pending.']) {
    assert.notEqual(analyzeVisit(visit({ notes, actionTaken: '', outcome: '' })).sales.stage, 'won');
  }
});

test('Turkish lexical evidence works without retaining names, phone numbers or records', () => {
  const result = analyzeVisit(visit({ notes: 'TEKLİF GÖNDERDİM. Sipariş onaylandı: 12 adet.', actionTaken: '', nextStep: '', outcome: '' }));
  assert.equal(result.sales.stage, 'won');
  assert.equal(result.quality.metrics.evidence.action, true);
  assert.equal(result.quality.metrics.evidence.document, true);
  assert.equal(result.quality.metrics.evidence.numeric, true);
});

test('explicit follow-up stage does not invent a recorded next step', () => {
  const result = analyzeVisit(visit({ notes: 'Discussed the available options.', actionTaken: '', nextStep: '', outcome: 'follow_up' }));
  assert.equal(result.sales.stage, 'follow_up');
  assert.equal(result.quality.metrics.evidence.nextStep, false);
});

test('duplicate narrative uses token similarity, matching rep and chronological history', () => {
  const current = visit();
  const earlier = visit({ occurredAt: '2026-06-11T12:00:00Z', customerId: 'fictional-customer-b' });
  const normal = analyzeVisit(current);
  const repeated = analyzeVisit(current, { priorVisits: [earlier] });
  assert.equal(repeated.quality.metrics.duplicateNarrative, true);
  assert.equal(repeated.quality.metrics.duplicateSimilarity, 1);
  assert.equal(repeated.quality.status, 'review');
  assert.ok(repeated.quality.score < normal.quality.score);
  assert.equal(analyzeVisit(current, { priorVisits: [{ ...earlier, repId: 'different-rep' }] }).quality.metrics.duplicateNarrative, false);
  assert.equal(analyzeVisit(current, { priorVisits: [{ ...earlier, occurredAt: '2026-06-13T12:00:00Z' }] }).quality.metrics.duplicateComparisonCount, 0);
  assert.equal(analyzeVisit({ ...current, repId: undefined }, { priorVisits: [{ ...earlier, repId: undefined }] }).quality.metrics.duplicateComparisonCount, 0);
});

test('location distance flags are review signals and remote wording suppresses them', () => {
  const customer = { id: 'fictional-customer-a', lat: 0, lng: 1 };
  const result = analyzeVisit(visit(), { customer });
  assert.equal(result.quality.metrics.locationAnomaly, true);
  assert.equal(result.quality.status, 'review');
  assert.ok(result.quality.metrics.distanceKm > 100);
  const remote = analyzeVisit(visit({ notes: 'Remote meeting about the replacement schedule and requirements.' }), { customer });
  assert.equal(remote.quality.metrics.locationAnomaly, false);
  assert.equal(remote.quality.metrics.locationStatus, 'remote');
  assert.ok(remote.quality.metrics.distanceKm > 100);
  const futureRemotePlan = analyzeVisit(visit({ nextStep: 'Phone call next week' }), { customer });
  assert.equal(futureRemotePlan.quality.metrics.locationAnomaly, true);
  const otherCustomer = analyzeVisit(visit(), { customer: { ...customer, id: 'different-customer' } });
  assert.equal(otherCustomer.quality.metrics.distanceKm, null);
});

test('history location baseline is scoped by customer, speed by representative', () => {
  const earlier = visit({ occurredAt: '2026-06-12T11:59:00Z', lat: 0, lng: 1, repId: 'another-rep' });
  const result = analyzeVisit(visit(), { priorVisits: [earlier] });
  assert.equal(result.quality.metrics.locationAnomaly, true);
  assert.equal(result.quality.metrics.travelSpeedKmh, null);
  const otherCustomer = { ...earlier, customerId: 'different-customer', repId: 'fictional-rep-a' };
  const speed = analyzeVisit(visit(), { priorVisits: [otherCustomer] });
  assert.equal(speed.quality.metrics.locationAnomaly, false);
  assert.equal(speed.quality.metrics.travelAnomaly, true);
  assert.ok(speed.quality.metrics.travelSpeedKmh > 6000);
});

test('missing GPS is not consistency evidence, and malformed GPS never becomes zero', () => {
  const missing = analyzeVisit(visit({ lat: null, lng: null }));
  const invalid = analyzeVisit(visit({ lat: 'Infinity', lng: 0 }));
  assert.equal(missing.quality.metrics.locationStatus, 'missing');
  assert.equal(invalid.quality.metrics.locationStatus, 'invalid');
  assert.equal(invalid.quality.metrics.distanceKm, null);
  assert.equal(invalid.quality.metrics.travelSpeedKmh, null);
});

test('invalid and ambiguous dates cannot drive history or health', () => {
  for (const occurredAt of ['invalid', '2026-02-30', '2026-06-12T12:00:00', '2026-06-12T25:00:00Z', null, Infinity]) {
    const result = analyzeVisit(visit({ occurredAt }), { priorVisits: [visit()] });
    assert.equal(result.quality.metrics.validTimestamp, false, String(occurredAt));
    assert.equal(result.quality.metrics.sameCustomerVisits, 0);
    assert.equal(result.health.band, 'unknown');
    assert.equal(result.health.score, null);
    assert.ok(Number.isFinite(result.quality.score));
  }
  for (const occurredAt of ['2024-02-29', '2026-06-12T15:00:00+03:00', 0]) assert.equal(analyzeVisit(visit({ occurredAt })).quality.metrics.validTimestamp, true);
});

test('repeated contacts and an unaddressed plan are separate, configurable signals', () => {
  const current = visit({ notes: 'Discussed availability.', actionTaken: '', nextStep: '', outcome: '', amount: null });
  const history = [1, 2, 3, 4].map((day) => visit({ occurredAt: `2026-06-0${day}T12:00:00Z`, notes: `Different visit discussion number ${day} with a different note.` }));
  const result = analyzeVisit(current, { priorVisits: history });
  assert.equal(result.quality.metrics.repeatedWithoutProgress, true);
  assert.equal(result.quality.metrics.unaddressedFollowUp, true);
  const completed = analyzeVisit({ ...current, outcome: 'won' }, { priorVisits: history });
  assert.equal(completed.quality.metrics.repeatedWithoutProgress, false);
  assert.equal(completed.quality.metrics.unaddressedFollowUp, false);
});

test('health is deterministic and decreases when configurable reference time advances', () => {
  const current = visit();
  const now = analyzeVisit(current);
  const later = analyzeVisit(current, { config: { asOf: '2026-09-12T12:00:00Z' } });
  assert.ok(now.health.score > later.health.score);
  assert.equal(later.health.band, 'attention');
  assert.deepEqual(analyzeVisit(current), now);
  assert.equal(analyzeVisit({ ...current, customerId: null }).health.band, 'unknown');
  assert.equal(analyzeVisit(current, { config: { asOf: 'invalid' } }).health.band, 'unknown');
});

test('health scopes customers and does not use future history or mismatched plans', () => {
  const current = visit();
  const baseline = analyzeVisit(current);
  const unrelated = visit({ customerId: 'other', repId: 'other-rep', occurredAt: '2026-06-11T12:00:00Z' });
  const future = visit({ occurredAt: '2026-06-30T12:00:00Z' });
  assert.deepEqual(analyzeVisit(current, { priorVisits: [unrelated, future] }).health, baseline.health);
  const scheduled = analyzeVisit(current, { customer: { id: current.customerId, nextFollowUpAt: '2026-06-13' } });
  const unrelatedPlan = analyzeVisit(current, { customer: { id: 'other', nextFollowUpAt: '2026-06-13' } });
  assert.ok(scheduled.health.score > baseline.health.score);
  assert.deepEqual(unrelatedPlan.health, baseline.health);
});

test('nested config changes defaults without mutating input or global defaults', () => {
  const current = visit();
  const options = { customer: { id: current.customerId, lat: 0, lng: 1 }, priorVisits: [], config: { history: { locationRadiusKm: 200 }, quality: { weights: { notes: 0 } } } };
  const before = JSON.stringify({ current, options });
  const result = analyzeVisit(current, options);
  assert.equal(result.quality.metrics.locationAnomaly, false);
  assert.ok(result.quality.score < analyzeVisit(current).quality.score);
  assert.equal(JSON.stringify({ current, options }), before);
  assert.equal(DEFAULT_ANALYSIS_CONFIG.quality.weights.notes, 16);
  assert.ok(Object.isFrozen(DEFAULT_ANALYSIS_CONFIG.quality.weights));
});

test('effective configuration reports overrides and roundtrips through analysis', () => {
  const overrides = {
    asOf: '2026-06-13T12:00:00Z',
    history: { locationRadiusKm: 200 },
    quality: { weights: { notes: 9 } },
    lexicon: { proposal: ['custom quotation'] },
  };
  const effective = resolveAnalysisConfig(overrides);
  assert.equal(effective.asOf, overrides.asOf);
  assert.equal(effective.history.locationRadiusKm, 200);
  assert.equal(effective.history.duplicateLookback, DEFAULT_ANALYSIS_CONFIG.history.duplicateLookback);
  assert.equal(effective.quality.weights.notes, 9);
  assert.equal(effective.quality.weights.action, DEFAULT_ANALYSIS_CONFIG.quality.weights.action);
  assert.deepEqual(effective.lexicon.proposal, ['custom quotation']);
  assert.deepEqual(resolveAnalysisConfig(JSON.parse(JSON.stringify(effective))), effective);
  assert.deepEqual(analyzeVisit(visit(), { config: effective }), analyzeVisit(visit(), { config: overrides }));
  assert.deepEqual(resolveAnalysisConfig(), DEFAULT_ANALYSIS_CONFIG);
});

test('configuration resolution discards invalid numeric settings and unknown keys', () => {
  const effective = resolveAnalysisConfig({
    privateField: 'must not appear in reported configuration',
    history: { locationRadiusKm: NaN, maximumTravelKmh: -1, duplicateLookback: Infinity, extra: 5 },
    quality: { weights: { notes: '9' } },
    lexicon: { proposal: [null, false, '', '   ', ' valid phrase '] },
  });
  assert.equal(effective.history.locationRadiusKm, DEFAULT_ANALYSIS_CONFIG.history.locationRadiusKm);
  assert.equal(effective.history.maximumTravelKmh, DEFAULT_ANALYSIS_CONFIG.history.maximumTravelKmh);
  assert.equal(effective.history.duplicateLookback, DEFAULT_ANALYSIS_CONFIG.history.duplicateLookback);
  assert.equal(effective.quality.weights.notes, DEFAULT_ANALYSIS_CONFIG.quality.weights.notes);
  assert.equal(Object.hasOwn(effective, 'privateField'), false);
  assert.equal(Object.hasOwn(effective.history, 'extra'), false);
  assert.deepEqual(effective.lexicon.proposal, ['valid phrase']);
  assert.deepEqual(resolveAnalysisConfig(null), DEFAULT_ANALYSIS_CONFIG);
});

test('malformed inputs/configuration preserve serializable shapes and finite scores', () => {
  for (const input of [undefined, null, false, 5, [], {}, { notes: { invalid: true }, durationMinutes: NaN, lat: [], lng: false }]) {
    const result = analyzeVisit(input, { priorVisits: [null, false, [], {}], config: { history: { duplicateLookback: Infinity }, quality: { weights: { notes: -5 } } } });
    assert.deepEqual(Object.keys(result), ['quality', 'sales', 'health']);
    assert.ok(Number.isFinite(result.quality.score));
    assert.ok(Number.isFinite(result.sales.score));
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
  }
  const zeroWeights = analyzeVisit(visit(), { config: { health: { weights: { recency: 0, intensity: 0, momentum: 0, quality: 0 } } } });
  assert.equal(zeroWeights.health.band, 'unknown');
});

test('snapshot-cached and standalone analyses are exactly equal with full histories', () => {
  const config = { asOf: '2026-07-01T12:00:00Z', history: { locationRadiusKm: 2.5 } };
  const records = Array.from({ length: 32 }, (_, i) => visit({
    customerId: `fictional-customer-${i % 3}`,
    repId: `fictional-rep-${i % 4}`,
    occurredAt: new Date(Date.UTC(2026, 5, 1, i * 12)).toISOString(),
    notes: i % 5 ? `Discussed component requirements and delivery plan number ${i}.` : 'Order confirmed for 12 units.',
    actionTaken: i % 7 ? 'Sent proposal' : '',
    nextStep: i % 2 ? 'Follow up with purchasing' : '',
    outcome: i % 5 ? 'proposal' : 'won',
    lat: i % 6 ? 0 : null,
    lng: i % 6 ? (i % 3) / 10 : null,
  }));
  const analyzer = createVisitAnalyzer(config);
  for (const current of records) {
    const options = { priorVisits: records, customer: { id: current.customerId, nextFollowUpAt: '2026-07-02' } };
    assert.deepEqual(analyzer.analyzeVisit(current, options), analyzeVisit(current, { ...options, config }));
  }
  // Reusing cached evidence must not leak mutable aliases through public results.
  const first = analyzer.analyzeVisit(records[0], { priorVisits: records });
  first.quality.metrics.evidence.action = !first.quality.metrics.evidence.action;
  analyzer.config.quality.weights.notes = 0;
  assert.deepEqual(analyzer.analyzeVisit(records[0], { priorVisits: records }), analyzeVisit(records[0], { priorVisits: records, config }));
});

test('fresh snapshot analyzers observe edits and isolate different configurations', () => {
  const current = visit();
  const initial = createVisitAnalyzer().analyzeVisit(current);
  current.notes = 'Order confirmed for 12 units.';
  current.outcome = 'won';
  const fresh = createVisitAnalyzer().analyzeVisit(current);
  assert.deepEqual(fresh, analyzeVisit(current));
  assert.notEqual(fresh.sales.stage, initial.sales.stage);
  const otherConfig = { quality: { weights: { notes: 0 } } };
  assert.deepEqual(createVisitAnalyzer(otherConfig).analyzeVisit(current), analyzeVisit(current, { config: otherConfig }));
  assert.deepEqual(createVisitAnalyzer().analyzeVisit(current), fresh);
});

test('1,000-record cached snapshot keeps all history and exact 84-day activity counts', (t) => {
  const records = Array.from({ length: 1000 }, (_, i) => visit({
    occurredAt: new Date(Date.UTC(2026, 0, 1) + i * 3 * 3_600_000).toISOString(),
    notes: `Discussed component requirements and delivery schedule at fictional visit ${i}.`,
    outcome: i % 11 ? 'proposal' : 'won',
  }));
  const started = performance.now();
  const analyzer = createVisitAnalyzer();
  let last;
  for (const current of records) last = analyzer.analyzeVisit(current, { priorVisits: records });
  const elapsed = performance.now() - started;
  t.diagnostic(`1,000 visits with full history: ${elapsed.toFixed(1)} ms`);
  assert.equal(last.quality.metrics.sameCustomerVisits, 999);
  assert.match(last.health.reasons[1], /169 recent and 504 earlier visits/);
  assert.match(last.health.reasons[3], /over 1000 visits/);
});

test('indexed batch exactly matches standalone for shuffled, tied and invalid timestamps', () => {
  const chronological = Array.from({ length: 61 }, (_, i) => visit({
    customerId: `fictional-customer-${i % 3}`,
    repId: `fictional-rep-${i % 2}`,
    occurredAt: new Date(Date.UTC(2026, 5, 1, 12) + Math.floor(i / 5) * 5 * 86_400_000).toISOString(),
    notes: i % 7 ? `Discussed fictional component requirements at visit ${i}.` : 'Order confirmed for 12 units.',
    actionTaken: i % 4 ? 'Sent proposal' : '',
    nextStep: i % 5 ? '' : 'Follow up with purchasing',
    outcome: i % 7 ? 'proposal' : 'won',
    lat: i % 9 ? 0 : null,
    lng: i % 9 ? i / 100 : null,
    durationMinutes: i % 8 ? 25 : 1,
  }));
  chronological[57].customerId = undefined;
  chronological[58].repId = undefined;
  chronological[59].occurredAt = '2026-02-30';
  chronological[60].occurredAt = null;
  const inputs = Array.from({ length: 61 }, (_, i) => chronological[(i * 17) % 61]);
  inputs.push(null, {});
  const customerById = new Map([0, 1, 2].map((i) => [`fictional-customer-${i}`, { id: `fictional-customer-${i}`, lat: 0, lng: i / 10, nextFollowUpAt: '2026-07-15' }]));
  for (const asOf of [null, '2026-06-22T12:00:00Z', '2026-11-01T12:00:00Z', 'invalid']) {
    const config = { asOf, quality: { weights: { notes: 13.25 } }, history: { duplicateLookback: 4 } };
    const analyzer = createVisitAnalyzer(config);
    const actual = analyzer.analyzeChronological(inputs, { customerById });
    assert.equal(actual.length, inputs.length);
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i], customer = customerById.get(input?.customerId);
      assert.deepEqual(actual[i], analyzeVisit(input, { priorVisits: inputs, customer, config }), `input ${i}, asOf ${asOf}`);
    }
  }
});

test('5,000-record indexed batch keeps all history without per-record history scans', (t) => {
  const inputs = Array.from({ length: 5000 }, (_, i) => visit({
    occurredAt: new Date(Date.UTC(2025, 0, 1) + i * 3 * 3_600_000).toISOString(),
    notes: `Discussed component requirements and delivery schedule at fictional visit ${i}.`,
    outcome: i % 11 ? 'proposal' : 'won',
  }));
  const started = performance.now();
  const actual = createVisitAnalyzer().analyzeChronological(inputs);
  const elapsed = performance.now() - started;
  t.diagnostic(`5,000 visits with indexed full history: ${elapsed.toFixed(1)} ms`);
  const last = actual.at(-1);
  assert.equal(actual.length, 5000);
  assert.equal(last.quality.metrics.sameCustomerVisits, 4999);
  assert.match(last.health.reasons[1], /169 recent and 504 earlier visits/);
  assert.match(last.health.reasons[3], /over 5000 visits/);
  // Independent direct calculations at representative positions guard prefix and
  // bounded-duplicate semantics without benchmarking the quadratic old path.
  for (const position of [0, 1, 21, 100, 4999]) assert.deepEqual(actual[position], analyzeVisit(inputs[position], { priorVisits: inputs }));
});

test('batch preserves standalone floating addition order for fractional quality weights', () => {
  const config = { quality: { weights: { notes: 0.1, action: 0.2, nextStep: 0, outcome: 0, document: 0, numeric: 0, location: 0, timestamp: 0 } } };
  const inputs = Array.from({ length: 81 }, (_, i) => ({
    customerId: 'fictional-customer', repId: 'fictional-rep',
    occurredAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    notes: i < 40 ? 'A detailed fictional discussion about component requirements.' : '',
    actionTaken: i >= 40 ? 'Test' : '',
  }));
  const batch = createVisitAnalyzer(config).analyzeChronological(inputs);
  for (let i = 0; i < inputs.length; i++) assert.deepEqual(batch[i], analyzeVisit(inputs[i], { priorVisits: inputs, config }));
});
