// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { DEFAULT_ANALYSIS_CONFIG } from '../server/analysis.js';

async function fixture(t, options = {}) {
  const app = createApp({ env: {}, dbPath: ':memory:', now: () => '2026-10-18T12:00:00.000Z', ...options });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { app.locals.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, url, body, headers = {}) {
    const response = await fetch(base + url, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { app, server, base, request };
}
async function records(request) {
  const rep = await request('POST', '/api/reps', { name: 'Example Rep', email: 'rep@example.test' });
  const customer = await request('POST', '/api/customers', { name: 'Example Customer', lat: 35, lng: -100, assignedRepId: rep.body.id });
  assert.equal(rep.status, 201); assert.equal(customer.status, 201);
  return { rep: rep.body, customer: customer.body };
}
const visit = (rep, customer, extra = {}) => ({ repId: rep.id, customerId: customer.id, occurredAt: '2026-10-15T10:00:00Z', lat: 35, lng: -100,
  notes: 'Completed meeting and reviewed 8 sample components. Shared quotation with the fictional purchasing contact.', actionTaken: 'Delivered sample and performed demo.', nextStep: 'Call again next week to review the proposal.', outcome: 'proposal', amount: 0, durationMinutes: 30, ...extra });

test('factory starts empty and explicit demo mode is opt-in with fictional records', async t => {
  const empty = await fixture(t); let result = await empty.request('GET', '/api/summary'); assert.equal(result.body.counts.customers, 0); assert.equal(result.body.quality.averageScore, null);
  const demo = await fixture(t, { demo: true }); result = await demo.request('GET', '/api/summary');
  assert.deepEqual(result.body.counts, { customers: 6, reps: 3, visits: 9, appointments: 3, routes: 1, targets: 3 });
  assert.equal((await demo.request('GET', '/api/health')).body.aiMode, 'mock');
  assert.ok((await demo.request('GET', '/api/customers')).body.items.every(v => v.email.endsWith('@example.test')));
});

test('customer/rep CRUD, pagination and text search preserve normalized records', async t => {
  const { request } = await fixture(t), { rep, customer } = await records(request);
  let result = await request('PATCH', `/api/customers/${customer.id}`, { contactName: 'Contact Example', notes: 'Revised synthetic note' });
  assert.equal(result.status, 200); assert.equal(result.body.name, customer.name); assert.equal(result.body.contactName, 'Contact Example');
  result = await request('GET', '/api/customers?limit=1&offset=0&search=example'); assert.equal(result.body.total, 1); assert.equal(result.body.items[0].id, customer.id);
  result = await request('PUT', `/api/reps/${rep.id}`, { name: 'Replacement Example Rep', active: false }); assert.equal(result.body.active, false);
  assert.equal((await request('GET', '/api/reps?limit=0')).status, 400);
  assert.equal((await request('GET', '/api/customers?unknown=value')).status, 400);
});

test('visits, appointments, targets and routes work and referenced records cannot be silently deleted', async t => {
  const { request } = await fixture(t), { rep, customer } = await records(request);
  const v = await request('POST', '/api/visits', visit(rep, customer, { outcome: 'won', amount: 750 })); assert.equal(v.status, 201); assert.equal(v.body.analysis.sales.stage, 'won');
  const appointment = await request('POST', '/api/appointments', { customerId: customer.id, repId: rep.id, startsAt: '2026-10-20T09:00:00Z', endsAt: '2026-10-20T09:30:00Z', title: 'Example follow-up' }); assert.equal(appointment.status, 201);
  const target = await request('POST', '/api/targets', { repId: rep.id, periodStart: '2026-10-01', periodEnd: '2026-10-31', visitGoal: 10, salesGoal: 1000 }); assert.equal(target.status, 201);
  const route = await request('POST', '/api/routes', { repId: rep.id, name: 'One example stop', visitDate: '2026-10-20', stopCustomerIds: [customer.id] }); assert.equal(route.status, 201); assert.equal(route.body.distanceKm, 0); assert.equal(route.body.stops[0].customerId, customer.id);
  let summary = (await request('GET', '/api/summary')).body; assert.equal(summary.sales.totalAmount, 750); assert.equal(summary.targets[0].actualVisits, 1); assert.equal(summary.targets[0].salesProgress, 75);
  assert.equal((await request('DELETE', `/api/customers/${customer.id}`)).status, 409); assert.equal((await request('DELETE', `/api/reps/${rep.id}`)).status, 409);
  for (const [kind, id] of [['visits', v.body.id], ['appointments', appointment.body.id], ['routes', route.body.id], ['targets', target.body.id]]) assert.equal((await request('DELETE', `/api/${kind}/${id}`)).status, 200);
  assert.equal((await request('DELETE', `/api/customers/${customer.id}`)).status, 200); assert.equal((await request('DELETE', `/api/reps/${rep.id}`)).status, 200);
  summary = (await request('GET', '/api/summary')).body; assert.equal(summary.counts.visits, 0);
});

test('exact visit deduplication rejects repeat submissions while keeping legitimate later records', async t => {
  const { request } = await fixture(t), { rep, customer } = await records(request); const body = visit(rep, customer);
  assert.equal((await request('POST', '/api/visits', body)).status, 201);
  const duplicate = await request('POST', '/api/visits', { ...body, occurredAt: '2026-10-15T10:00:00.000Z' }); assert.equal(duplicate.status, 409); assert.equal(duplicate.body.error.code, 'DUPLICATE_VISIT');
  const later = await request('POST', '/api/visits', { ...body, occurredAt: '2026-10-16T10:00:00Z' }); assert.equal(later.status, 201); assert.equal(later.body.analysis.quality.metrics.duplicateNarrative, true);
  assert.equal((await request('GET', '/api/visits')).body.total, 2);
});

test('GPS and narrative signals are exposed for review without accusatory judgements', async t => {
  const { request } = await fixture(t), { rep, customer } = await records(request);
  const result = await request('POST', '/api/visits', visit(rep, customer, { lat: 36 }));
  assert.equal(result.status, 201); assert.equal(result.body.analysis.quality.metrics.locationAnomaly, true); assert.notEqual(result.body.analysis.quality.status, 'complete');
  const analysis = (await request('GET', '/api/analysis')).body; assert.ok(analysis.limitations.some(v => /human review/u.test(v)));
});

test('finite coordinates, real calendar timestamps, amounts, references and nested values are validated', async t => {
  const { request, base } = await fixture(t), { rep, customer } = await records(request);
  for (const patch of [{ lat: 91 }, { lng: -181 }, { lat: '35' }, { lat: null }, { occurredAt: '2026-02-30T12:00:00Z' }, { occurredAt: '2026-10-15T12:00:00' }, { occurredAt: '9999-12-31T23:59:59-14:00' }, { durationMinutes: -1 }, { amount: -1 }, { notes: { text: 'nested' } }, { outcome: 'invented' }, { customerId: 'missing' }, { extra: 'not allowed' }]) assert.equal((await request('POST', '/api/visits', visit(rep, customer, patch))).status, 400, JSON.stringify(patch));
  const raw = await fetch(base + '/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"Example","lat":1e999,"lng":0}' }); assert.equal(raw.status, 400);
  assert.equal((await request('POST', '/api/customers', { id: 'injected', name: 'Example' })).status, 400);
  assert.equal((await request('POST', '/api/reps', { name: 'Example', email: 'invalid-address' })).status, 400);
  assert.equal((await request('POST', '/api/routes', { repId: rep.id, name: 'Route', visitDate: '2026-10-20', stopCustomerIds: [customer.id, customer.id] })).status, 400);
  assert.equal((await request('POST', '/api/appointments', { repId: rep.id, customerId: customer.id, title: 'Meeting', startsAt: '2026-10-20T10:00:00Z', endsAt: '2026-10-20T09:00:00Z' })).status, 400);
});

test('origin/host checks and optional token protect local API before mutation', async t => {
  const token = 'unit-test-only-token', { request, base } = await fixture(t, { apiToken: token });
  assert.equal((await request('GET', '/api/summary')).status, 401);
  assert.equal((await request('GET', '/api/summary', undefined, { 'X-API-Key': token })).status, 200);
  assert.equal((await request('GET', '/api/summary', undefined, { Authorization: `Bearer ${token}` })).status, 200);
  assert.equal((await request('POST', '/api/reps', { name: 'Denied' }, { 'X-API-Key': token, Origin: 'https://untrusted.example' })).status, 403);
  // Node fetch intentionally replaces Host. Use the actual HTTP transport to
  // verify the server's DNS-rebinding check rather than a forbidden header API.
  const hostileHost = await new Promise((resolve, reject) => {
    const req = http.get(base + '/api/summary', { headers: { 'X-API-Key': token, Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); }); req.on('error', reject);
  });
  assert.equal(hostileHost, 403);
  assert.equal((await request('POST', '/api/reps', { name: 'Denied' }, { 'X-API-Key': token, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.throws(() => createApp({ env: {}, dbPath: ':memory:', host: '0.0.0.0' }), /token/u);
});

test('bounded JSON, collection limits and error output do not expose internals', async t => {
  const { request, app, base } = await fixture(t);
  assert.equal((await request('POST', '/api/reps', { name: 'x'.repeat(70000) })).status, 413);
  const raw = await fetch(base + '/api/reps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }); assert.equal(raw.status, 400);
  for (let i = 0; i < 200; i++) app.locals.store.create('reps', { name: `Example ${i}` });
  const limited = await request('POST', '/api/reps', { name: 'Over capacity' }); assert.equal(limited.status, 409); assert.equal(limited.body.error.code, 'RECORD_LIMIT');
  assert.equal((await request('GET', '/api/unknown')).status, 404); assert.equal((await request('GET', '/api/reps/%27--')).status, 400);
});

test('connector registry accepts metadata only and never enables delivery', async t => {
  const { request } = await fixture(t);
  const valid = await request('POST', '/api/connectors', { name: 'Example registry', type: 'crm', url: 'https://crm.example.test' }); assert.equal(valid.status, 201); assert.equal(valid.body.deliveryEnabled, false);
  for (const url of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test/?token=hidden']) assert.equal((await request('POST', '/api/connectors', { name: 'Example', type: 'webhook', url })).status, 400);
  assert.equal((await request('PATCH', `/api/connectors/${valid.body.id}`, { secret: 'not accepted' })).status, 400);
});

test('mock agents are deterministic read-only summaries and optional provider is explicit', async t => {
  const { request, app } = await fixture(t, { demo: true });
  for (const agent of ['analyst', 'planner', 'coach']) { const result = await request('POST', '/api/agents/chat', { agent, message: 'Explain the current summary' }); assert.equal(result.status, 200); assert.equal(result.body.mode, 'mock'); assert.equal(result.body.readOnly, true); }
  assert.equal(app.locals.store.count('visits'), 9);
  assert.throws(() => createApp({ env: {}, dbPath: ':memory:', aiEnabled: true }), /CRM_AI_MODEL/u);
  let calls = 0;
  const enabled = await fixture(t, { demo: true, aiEnabled: true, aiModel: 'unit-test-model', aiApiKey: 'test-placeholder', aiProvider: async ({ prompt }) => { calls++; assert.ok(!prompt.includes('contact1@example.test')); return 'Read-only aggregate result.'; } });
  assert.equal(calls, 0); const result = await enabled.request('POST', '/api/agents/chat', { agent: 'analyst', message: 'Explain the summary' }); assert.equal(result.body.mode, 'gemini'); assert.equal(calls, 1);
});

test('SSE announces readiness and a metadata-only change after a successful write', { timeout: 3000 }, async t => {
  const { request, base } = await fixture(t), controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(base + '/api/events', { signal: controller.signal }); assert.equal(response.status, 200);
  const reader = response.body.getReader(); let buffer = new TextDecoder().decode((await reader.read()).value); assert.match(buffer, /event: ready/u);
  const created = await request('POST', '/api/reps', { name: 'Example Event Rep' });
  while (!buffer.includes('event: change')) { const chunk = await reader.read(); assert.equal(chunk.done, false, 'Event stream closed before its change event'); buffer += new TextDecoder().decode(chunk.value); }
  assert.ok(buffer.includes(created.body.id)); assert.ok(!buffer.includes('Example Event Rep')); controller.abort();
});

test('analysis keeps full bounded history and reports effective programmatic configuration', async t => {
  const { request, app } = await fixture(t, { analysisConfig: { history: { duplicateLookback: 3 }, health: { historyWindowDays: 100 } } });
  const { rep, customer } = await records(request);
  for (let i = 0; i < 32; i++) app.locals.store.create('visits', visit(rep, customer, { occurredAt: new Date(Date.UTC(2026, 8, 1 + i, 10)).toISOString() }));
  const result = await request('GET', '/api/analysis'); assert.equal(result.body.total, 32); assert.equal(result.body.visits[0].analysis.quality.metrics.sameCustomerVisits, 31);
  assert.equal(result.body.config.history.duplicateLookback, 3); assert.equal(result.body.config.health.historyWindowDays, 100); assert.equal(result.body.config.quality.completeScore, DEFAULT_ANALYSIS_CONFIG.quality.completeScore);
});

test('future visits cannot alter customer health at a fixed reference date', async t => {
  const { request } = await fixture(t), { rep, customer } = await records(request);
  await request('POST', '/api/visits', visit(rep, customer, { occurredAt: '2026-10-17T10:00:00Z' }));
  const before = (await request('GET', '/api/summary')).body.customerHealth[0];
  await request('POST', '/api/visits', visit(rep, customer, { occurredAt: '2026-10-20T10:00:00Z', notes: 'A future synthetic record with different text' }));
  const after = (await request('GET', '/api/summary')).body.customerHealth[0];
  assert.deepEqual(after, before);
});

test('one thousand complete records remain practical without dropping older history', async t => {
  const { request, app } = await fixture(t), { rep, customer } = await records(request);
  for (let i = 0; i < 1000; i++) app.locals.store.create('visits', visit(rep, customer, { occurredAt: new Date(Date.UTC(2026, 8, 1, 10) + i * 3600000).toISOString() }));
  const start = performance.now();
  const result = await request('GET', '/api/analysis');
  const elapsed = performance.now() - start;
  assert.equal(result.status, 200); assert.equal(result.body.total, 1000);
  assert.equal(result.body.visits[0].analysis.quality.metrics.sameCustomerVisits, 999);
  assert.ok(result.body.customers[0].reasons.some(reason => /over 1000 visits/u.test(reason)));
  assert.ok(elapsed < 5000, `1000-record analysis took ${elapsed.toFixed(0)}ms`);
  const cachedStart = performance.now();
  for (const url of ['/api/summary', '/api/visits?limit=500&offset=0', '/api/visits?limit=500&offset=500']) assert.equal((await request('GET', url)).status, 200);
  assert.ok(performance.now() - cachedStart < 3000, 'Repeated pages/summary must reuse the unchanged analysis snapshot');
  app.locals.store.create('visits', visit(rep, customer, { occurredAt: '2026-10-18T11:00:00Z' }));
  const changed = await request('GET', '/api/analysis'); assert.equal(changed.body.total, 1001); assert.equal(changed.body.visits[0].analysis.quality.metrics.sameCustomerVisits, 1000);
});

test('demo seeding is deterministic and does not reseed an existing database', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kor-api-demo-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'test.sqlite');
  let store = createStore({ filename, seed: true }); const initial = store.all('customers');
  store.remove('connectors', 'connector-demo-1'); store.close();
  store = createStore({ filename, seed: true }); assert.equal(store.count('connectors'), 0); assert.deepEqual(store.all('customers'), initial); store.close();
  const fresh = createStore({ seed: true }); assert.deepEqual(fresh.all('customers'), initial); fresh.close();
});
