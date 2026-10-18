// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ApiError, ENTITY_FIELDS, normalizeEntity, identifier } from './validation.js';
import { LIMITS } from './config.js';
import { seedDemo } from './demo.js';

const KINDS = Object.freeze(Object.keys(ENTITY_FIELDS));
function kindName(kind) { if (!KINDS.includes(kind)) throw new ApiError(400, 'INVALID_ENTITY', 'Unknown collection'); return kind; }
const fingerprint = visit => createHash('sha256').update(JSON.stringify([
  visit.customerId, visit.repId, visit.occurredAt, visit.lat, visit.lng,
  visit.notes.trim().toLocaleLowerCase('en'), visit.actionTaken, visit.nextStep, visit.outcome, visit.amount, visit.durationMinutes,
])).digest('hex');

/** New database only: no production database is imported or opened by default. */
export function createStore({ filename = ':memory:', seed = false, now = () => new Date().toISOString() } = {}) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA max_page_count = 16384;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const base = 'id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL';
  db.exec(`
    CREATE TABLE IF NOT EXISTS reps (${base});
    CREATE TABLE IF NOT EXISTS customers (${base}, rep_id TEXT REFERENCES reps(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS visits (${base}, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      rep_id TEXT NOT NULL REFERENCES reps(id) ON DELETE RESTRICT, occurred_at TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS appointments (${base}, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
      rep_id TEXT NOT NULL REFERENCES reps(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS targets (${base}, rep_id TEXT NOT NULL REFERENCES reps(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS routes (${base}, rep_id TEXT NOT NULL REFERENCES reps(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS route_stops (route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, ordinal INTEGER NOT NULL,
      PRIMARY KEY(route_id, ordinal), UNIQUE(route_id, customer_id));
    CREATE TABLE IF NOT EXISTS connectors (${base});
    CREATE INDEX IF NOT EXISTS visits_time ON visits(occurred_at);
    CREATE INDEX IF NOT EXISTS visits_customer ON visits(customer_id);
    CREATE INDEX IF NOT EXISTS visits_rep ON visits(rep_id);
    PRAGMA user_version = 1;
  `);
  let closed = false, seeding = false, revision = 0;
  const hydrate = row => row ? { ...JSON.parse(row.payload), id: row.id, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  function get(kind, id) { kindName(kind); return hydrate(db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(identifier(id))); }
  function all(kind) { kindName(kind); return db.prepare(`SELECT * FROM ${kind} ORDER BY created_at DESC, id ASC`).all().map(hydrate); }
  function count(kind) { kindName(kind); return db.prepare(`SELECT count(*) AS total FROM ${kind}`).get().total; }
  function reference(kind, id, label) { if (id !== null && !get(kind, id)) throw new ApiError(400, 'UNKNOWN_REFERENCE', `${label} does not exist`); }
  function references(kind, value) {
    if ('repId' in value) reference('reps', value.repId, 'Rep');
    if ('assignedRepId' in value) reference('reps', value.assignedRepId, 'Assigned rep');
    if ('customerId' in value) reference('customers', value.customerId, 'Customer');
    if (kind === 'routes') for (const id of value.stopCustomerIds) reference('customers', id, 'Route customer');
  }
  function save(kind, value, id, old = null) {
    kindName(kind); references(kind, value);
    if (!old && count(kind) >= LIMITS.records[kind]) throw new ApiError(409, 'RECORD_LIMIT', `${kind} record limit reached`);
    const columns = ['id', 'payload', 'created_at', 'updated_at']; const current = seeding ? '2026-10-01T00:00:00.000Z' : now();
    const values = [id, JSON.stringify(value), old?.createdAt || current, current];
    if (kind === 'customers') { columns.push('rep_id'); values.push(value.assignedRepId); }
    if (kind === 'visits') { columns.push('customer_id', 'rep_id', 'occurred_at', 'fingerprint'); values.push(value.customerId, value.repId, value.occurredAt, fingerprint(value)); }
    if (kind === 'appointments') { columns.push('customer_id', 'rep_id'); values.push(value.customerId, value.repId); }
    if (['targets', 'routes'].includes(kind)) { columns.push('rep_id'); values.push(value.repId); }
    db.exec('BEGIN IMMEDIATE');
    try {
      if (old) {
        db.prepare(`UPDATE ${kind} SET ${columns.slice(1).map(c => `${c}=?`).join(',')} WHERE id=?`).run(...values.slice(1), id);
      } else db.prepare(`INSERT INTO ${kind} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...values);
      if (kind === 'routes') {
        db.prepare('DELETE FROM route_stops WHERE route_id=?').run(id);
        const insert = db.prepare('INSERT INTO route_stops(route_id,customer_id,ordinal) VALUES(?,?,?)');
        value.stopCustomerIds.forEach((customerId, index) => insert.run(id, customerId, index));
      }
      db.exec('COMMIT');
      revision++;
    } catch (error) {
      db.exec('ROLLBACK');
      if (kind === 'visits' && String(error.message).includes('fingerprint')) throw new ApiError(409, 'DUPLICATE_VISIT', 'This exact visit already exists; similar narratives are kept and marked for review');
      throw error;
    }
    return get(kind, id);
  }
  const store = {
    get, all, count,
    get revision() { return revision; },
    create(kind, raw, { id = randomUUID() } = {}) { return save(kind, normalizeEntity(kind, raw), identifier(id)); },
    update(kind, id, raw, { partial = true } = {}) {
      const previous = get(kind, id); if (!previous) throw new ApiError(404, 'NOT_FOUND', `${kind} record not found`);
      const editable = Object.fromEntries(ENTITY_FIELDS[kind].map(key => [key, previous[key]]));
      const value = normalizeEntity(kind, partial ? { ...editable, ...raw } : raw); return save(kind, value, id, previous);
    },
    remove(kind, id) {
      if (!get(kind, id)) throw new ApiError(404, 'NOT_FOUND', `${kind} record not found`);
      try { db.prepare(`DELETE FROM ${kindName(kind)} WHERE id=?`).run(id); }
      catch (error) { if (String(error.message).includes('FOREIGN KEY')) throw new ApiError(409, 'REFERENCED_RECORD', 'This record is used by another CRM record; update or remove its references first'); throw error; }
      revision++; return { deleted: true, id };
    },
    close() { if (!closed) { closed = true; db.close(); } },
  };
  if (seed && KINDS.every(kind => count(kind) === 0)) {
    seeding = true;
    try { seedDemo(store); } catch (error) { store.close(); throw error; }
    finally { seeding = false; }
  }
  return store;
}
