// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { loadConfig, LIMITS, isLoopbackHost } from './config.js';
import { createStore } from './store.js';
import { ApiError, object, exactKeys, text, choice, number, identifier, timestamp, ENTITY_FIELDS, normalizeEntity } from './validation.js';
import { summarize, analysisSnapshot, routeDetails, ANALYSIS_LIMITATIONS } from './summaries.js';
import { createVisitAnalyzer } from './analysis.js';
import { createAgentResponder } from './agents.js';
import { DEMO_LABEL } from './demo.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asyncRoute = callback => (req, res, next) => Promise.resolve().then(() => callback(req, res)).catch(next);

function limiter(limit) {
  const clients = new Map();
  return (req, res, next) => {
    const key = req.socket.remoteAddress || 'local', now = Date.now();
    let entry = clients.get(key);
    if (!entry || entry.until <= now) {
      for (const [id, value] of clients) if (value.until <= now) clients.delete(id);
      if (clients.size >= 1024 && !clients.has(key)) return next(new ApiError(429, 'RATE_LIMITED', 'Request capacity reached'));
      entry = { until: now + 60000, count: 0 }; clients.set(key, entry);
    }
    if (++entry.count > limit) { res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000))); return next(new ApiError(429, 'RATE_LIMITED', 'Too many requests')); }
    next();
  };
}
function safeEqual(actual, expected) {
  const a = Buffer.from(actual), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b);
}
function pagination(query) {
  const parse = (value, fallback, min, max, label) => value === undefined ? fallback : typeof value === 'string' && /^\d+$/u.test(value) ? number(Number(value), label, { min, max, integer: true }) : (() => { throw new ApiError(400, 'INVALID_QUERY', `${label} must be an integer`); })();
  return { limit: parse(query.limit, 100, 1, LIMITS.pageSize, 'Limit'), offset: parse(query.offset, 0, 0, 100000, 'Offset') };
}
function filterRecords(records, query) {
  for (const field of ['customerId', 'repId', 'status']) if (query[field] !== undefined) {
    const value = text(query[field], field, 80, true); records = records.filter(record => record[field] === value);
  }
  if (query.from !== undefined || query.to !== undefined) {
    const from = query.from === undefined ? null : timestamp(query.from, 'From'), to = query.to === undefined ? null : timestamp(query.to, 'To');
    if (from && to && from > to) throw new ApiError(400, 'INVALID_QUERY', 'From must precede To');
    records = records.filter(record => { const time = record.occurredAt || record.startsAt; return time && (!from || time >= from) && (!to || time <= to); });
  }
  if (query.search !== undefined) { const search = text(query.search, 'Search', 120).toLocaleLowerCase('en'); records = records.filter(record => [record.name, record.title, record.notes].some(v => typeof v === 'string' && v.toLocaleLowerCase('en').includes(search))); }
  return records;
}
function skillMetadata(filename) {
  if (!fs.existsSync(filename)) return [];
  const info = fs.statSync(filename); if (info.size > 256 * 1024) throw new Error('Skill catalog is too large');
  const raw = JSON.parse(fs.readFileSync(filename, 'utf8')); if (!Array.isArray(raw) || raw.length > 100) throw new Error('Invalid skill catalog');
  return raw.map(item => {
    object(item, 'Skill metadata');
    let source = null;
    if (item.source !== undefined && item.source !== null) {
      object(item.source, 'Skill source'); exactKeys(item.source, ['file', 'sha256'], 'Skill source');
      const file = text(item.source.file, 'Skill source filename', 180, true);
      const sha256 = text(item.source.sha256, 'Skill source fingerprint', 64, true);
      if (file.includes('/') || file.includes('\\') || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error('Skill source must contain a filename and SHA-256 fingerprint');
      source = { file, sha256 };
    }
    return { id: text(item.id, 'Skill ID', 100, true), title: text(item.title, 'Skill title', 200, true), description: text(item.description, 'Skill description', 2000),
      capabilities: Array.isArray(item.capabilities) ? item.capabilities.slice(0, 30).map(v => text(v, 'Capability', 160)) : [], status: text(item.status, 'Skill status', 100), source };
  });
}

/** Construct a CRM app without a listener, timers, notifications, or provider calls. */
export function createApp(options = {}) {
  const config = { ...loadConfig(options.env || process.env), ...options };
  if (!Array.isArray(config.allowedOrigins) || !config.allowedOrigins.length || config.allowedOrigins.some(origin => {
    try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin || !!url.username || !!url.password; } catch { return true; }
  })) throw new Error('Configure explicit HTTP(S) origins without paths or credentials');
  if (!isLoopbackHost(config.host) && !config.apiToken) throw new Error('Non-loopback binding requires an API token');
  if (config.apiToken && (typeof config.apiToken !== 'string' || !/^[\x21-\x7e]{16,256}$/u.test(config.apiToken))) throw new Error('API token must contain 16–256 printable non-space ASCII characters');
  const responder = createAgentResponder(config, { provider: options.aiProvider });
  const catalog = skillMetadata(options.skillsPath || path.join(ROOT, 'skills', 'catalog.json'));
  const store = options.store || createStore({ filename: options.dbPath || path.join(config.dataDir, 'crm.sqlite'), seed: config.demo === true });
  const app = express(), clients = new Set(); let eventId = 0, closed = false;
  app.disable('x-powered-by'); app.set('query parser', 'simple');
  app.locals.store = store;
  app.locals.close = () => { if (!closed) { closed = true; for (const res of clients) res.end(); clients.clear(); store.close(); } };
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]', config.host, ...config.allowedOrigins.map(origin => new URL(origin).hostname)]);
  const notify = (entity, action, id) => { const payload = `id: ${++eventId}\nevent: change\ndata: ${JSON.stringify({ entity, action, id })}\n\n`; for (const response of clients) { if (response.destroyed || response.writableLength > 64 * 1024) { clients.delete(response); response.end(); } else response.write(payload); } };
  app.use(helmet({ contentSecurityPolicy: { directives: { 'connect-src': ["'self'"] } } }));
  app.use('/api', (req, _res, next) => {
    let host; try { if (!req.headers.host || /[@/\\\s]/u.test(req.headers.host)) throw new Error(); host = new URL(`http://${req.headers.host}`).hostname; } catch { return next(new ApiError(400, 'INVALID_HOST', 'Invalid Host header')); }
    if (!allowedHosts.has(host)) return next(new ApiError(403, 'HOST_DENIED', 'Host is not allowed'));
    const origin = req.get('Origin');
    if ((origin && !config.allowedOrigins.includes(origin)) || (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('Sec-Fetch-Site') === 'cross-site')) return next(new ApiError(403, 'ORIGIN_DENIED', 'Origin is not allowed'));
    next();
  });
  app.use(cors({ origin(origin, callback) { callback(null, !origin || config.allowedOrigins.includes(origin)); }, allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'], methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'] }));
  app.use('/api', (req, _res, next) => {
    if (config.apiToken) {
      const provided = req.get('X-API-Key') || (req.get('Authorization')?.startsWith('Bearer ') ? req.get('Authorization').slice(7) : '');
      if (!safeEqual(provided, config.apiToken)) return next(new ApiError(401, 'UNAUTHORIZED', 'A valid API token is required'));
    }
    next();
  });
  app.use('/api', limiter(config.rateLimit));
  app.use(express.json({ limit: LIMITS.jsonBytes, strict: true }));
  const snapshotOptions = () => ({ asOf: options.now ? options.now() : new Date().toISOString(), config: options.analysisConfig || {} });
  // No background timer: an immutable result is reused only while data/config
  // and the reference minute are unchanged. Every successful write increments
  // the store revision. Explicit test/programmatic clocks retain exact timing.
  let cachedSnapshot = null;
  const snapshot = () => {
    const settings = snapshotOptions();
    const timeKey = options.now ? settings.asOf : Math.floor(Date.parse(settings.asOf) / 60000);
    const key = `${store.revision}:${timeKey}:${JSON.stringify(settings.config)}`;
    if (Number.isSafeInteger(store.revision) && cachedSnapshot?.key === key) return cachedSnapshot.value;
    const value = analysisSnapshot(store, settings);
    if (Number.isSafeInteger(store.revision)) cachedSnapshot = { key, value };
    return value;
  };
  const summary = () => summarize(store, { ...snapshotOptions(), snapshot: snapshot() });
  const decorate = (kind, record, analyzed) => kind === 'visits' ? (analyzed || snapshot()).visits.find(v => v.id === record.id) : kind === 'routes' ? routeDetails(record, store) : record;

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', demo: Boolean(config.demo), demoLabel: config.demo ? DEMO_LABEL : null, aiMode: config.aiEnabled ? 'gemini' : 'mock', limits: LIMITS }));
  app.get('/api/skills', (_req, res) => res.json({ items: catalog }));
  app.get('/api/summary', (_req, res) => res.json({ ...summary(), demo: Boolean(config.demo) }));
  app.get('/api/analysis', (req, res, next) => {
    try { exactKeys(req.query, ['customerId', 'repId', 'from', 'to', 'limit', 'offset'], 'Query'); const full = snapshot(), { limit, offset } = pagination(req.query), visits = filterRecords(full.visits, req.query); res.json({ ...full, visits: visits.slice(offset, offset + limit), total: visits.length, limit, offset }); } catch (error) { next(error); }
  });
  app.post('/api/analysis', (req, res, next) => {
    try {
      object(req.body); exactKeys(req.body, ['visit']);
      const visit = normalizeEntity('visits', req.body.visit), customer = store.get('customers', visit.customerId);
      if (!customer || !store.get('reps', visit.repId)) throw new ApiError(400, 'UNKNOWN_REFERENCE', 'Customer and rep must exist');
      const analyzer = createVisitAnalyzer({ ...(options.analysisConfig || {}), asOf: snapshotOptions().asOf });
      const records = [...store.all('visits'), visit];
      const results = analyzer.analyzeChronological(records, { customerById: new Map([[customer.id, customer]]) });
      res.json({ analysis: results.at(-1), limitations: ANALYSIS_LIMITATIONS });
    } catch (error) { next(error); }
  });
  app.post('/api/agents/chat', limiter(20), asyncRoute(async (req, res) => {
    object(req.body); exactKeys(req.body, ['agent', 'message']); const agent = choice(req.body.agent, ['analyst', 'planner', 'coach'], 'Agent'), message = text(req.body.message, 'Message', 2000, true);
    res.json(await responder({ agent, message, summary: summary() }));
  }));
  app.get('/api/events', (req, res, next) => {
    if (clients.size >= LIMITS.sseClients) return next(new ApiError(429, 'SSE_LIMIT', 'Event stream connection limit reached'));
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders(); res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`); clients.add(res); req.on('close', () => clients.delete(res));
  });
  for (const kind of Object.keys(ENTITY_FIELDS)) {
    app.get(`/api/${kind}`, (req, res, next) => {
      try { exactKeys(req.query, ['limit', 'offset', 'search', 'customerId', 'repId', 'status', 'from', 'to'], 'Query'); const { limit, offset } = pagination(req.query); const analysis = kind === 'visits' ? snapshot() : null; const records = filterRecords(kind === 'visits' ? analysis.visits : store.all(kind), req.query); res.json({ items: records.slice(offset, offset + limit).map(v => decorate(kind, v, analysis)), total: records.length, limit, offset }); } catch (error) { next(error); }
    });
    app.get(`/api/${kind}/:id`, (req, res, next) => {
      try { const record = store.get(kind, identifier(req.params.id)); if (!record) throw new ApiError(404, 'NOT_FOUND', `${kind} record not found`); res.json(decorate(kind, record)); } catch (error) { next(error); }
    });
    app.post(`/api/${kind}`, (req, res, next) => {
      try { object(req.body); const record = store.create(kind, req.body); notify(kind, 'created', record.id); res.status(201).json(decorate(kind, record)); } catch (error) { next(error); }
    });
    for (const [method, partial] of [['patch', true], ['put', false]]) app[method](`/api/${kind}/:id`, (req, res, next) => {
      try { object(req.body); exactKeys(req.body, ENTITY_FIELDS[kind]); const record = store.update(kind, identifier(req.params.id), req.body, { partial }); notify(kind, 'updated', record.id); res.json(decorate(kind, record)); } catch (error) { next(error); }
    });
    app.delete(`/api/${kind}/:id`, (req, res, next) => {
      try { const result = store.remove(kind, identifier(req.params.id)); notify(kind, 'deleted', result.id); res.json(result); } catch (error) { next(error); }
    });
  }
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'API route not found')));
  const staticDir = options.staticDir || path.join(ROOT, 'dist');
  app.use(express.static(staticDir, { dotfiles: 'deny', index: false }));
  app.get('*', (_req, res) => { const index = path.join(staticDir, 'index.html'); if (fs.existsSync(index)) res.sendFile(index); else res.json({ name: 'KOR AI CRM', api: '/api/health', frontend: 'Build the frontend to serve the application here.' }); });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    const status = error instanceof ApiError ? error.status : error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && 'body' in error ? 400 : 500;
    res.status(status).json({ error: { code: error instanceof ApiError ? error.code : status === 413 ? 'BODY_LIMIT' : status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR', message: error instanceof ApiError ? error.message : status === 413 ? 'Request body is too large' : status === 400 ? 'Body must contain valid JSON' : 'The request could not be completed' } });
  });
  return app;
}
