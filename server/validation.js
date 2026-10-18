// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
export class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
export const invalid = message => { throw new ApiError(400, 'INVALID_INPUT', message); };
export function object(value, label = 'Body') { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid(`${label} must be an object`); return value; }
export function exactKeys(value, allowed, label = 'Body') { const bad = Object.keys(value).filter(k => !allowed.includes(k)); if (bad.length) invalid(`${label} has unsupported fields: ${bad.slice(0, 5).join(', ')}`); }
export function text(value, label, max = 200, required = false) {
  if (value === undefined || value === null) { if (required) invalid(`${label} is required`); return ''; }
  if (typeof value !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) invalid(`${label} must be text without control characters`);
  const result = value.trim(); if (result.length > max || (required && !result)) invalid(`${label} must contain ${required ? '1' : '0'}–${max} characters`); return result;
}
export function identifier(value, label = 'ID', nullable = false) { if (nullable && (value === null || value === undefined || value === '')) return null; const id = text(value, label, 80, true); if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(id)) invalid(`${label} is invalid`); return id; }
export function number(value, label, { min = 0, max = 1e12, integer = false, nullable = false, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) invalid(`${label} must be ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}`); return value;
}
export function boolean(value, label, fallback = false) { if (value === undefined) return fallback; if (typeof value !== 'boolean') invalid(`${label} must be boolean`); return value; }
export function choice(value, allowed, label, fallback) { if (value === undefined && fallback !== undefined) return fallback; if (!allowed.includes(value)) invalid(`${label} must be one of ${allowed.join(', ')}`); return value; }
export function date(value, label = 'Date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) invalid(`${label} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} is not a calendar date`); return value;
}
export function timestamp(value, label = 'Timestamp') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/u.test(value)) invalid(`${label} must be an ISO timestamp with timezone`);
  date(value.slice(0, 10), label); const ms = Date.parse(value); if (!Number.isFinite(ms)) invalid(`${label} is invalid`);
  const normalized = new Date(ms).toISOString();
  if (!/^\d{4}-/u.test(normalized)) invalid(`${label} normalizes outside the supported four-digit calendar years`);
  return normalized;
}
const notes = v => text(v, 'Notes', 4000);
const contact = raw => ({ email: (() => { const v = text(raw.email, 'Email', 254); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v)) invalid('Email is invalid'); return v; })(), phone: (() => { const v = text(raw.phone, 'Phone', 40); if (v && !/^[+0-9(). x-]+$/u.test(v)) invalid('Phone contains unsupported characters'); return v; })() });
const coords = raw => {
  const lat = number(raw.lat, 'Latitude', { min: -90, max: 90, nullable: true });
  const lng = number(raw.lng, 'Longitude', { min: -180, max: 180, nullable: true });
  if ((lat === null) !== (lng === null)) invalid('Latitude and longitude must both be present or both null'); return { lat, lng };
};
export const ENTITY_FIELDS = Object.freeze({
  reps: ['name', 'email', 'phone', 'region', 'active'],
  customers: ['name', 'contactName', 'email', 'phone', 'address', 'industry', 'lat', 'lng', 'assignedRepId', 'status', 'notes'],
  visits: ['customerId', 'repId', 'occurredAt', 'lat', 'lng', 'notes', 'actionTaken', 'nextStep', 'outcome', 'amount', 'durationMinutes'],
  appointments: ['customerId', 'repId', 'startsAt', 'endsAt', 'title', 'status', 'notes'],
  targets: ['repId', 'periodStart', 'periodEnd', 'visitGoal', 'salesGoal'],
  routes: ['repId', 'name', 'visitDate', 'stopCustomerIds', 'notes'],
  connectors: ['name', 'type', 'url'],
});
export function normalizeEntity(kind, raw) {
  object(raw); exactKeys(raw, ENTITY_FIELDS[kind], kind);
  switch (kind) {
    case 'reps': return { name: text(raw.name, 'Name', 160, true), ...contact(raw), region: text(raw.region, 'Region', 160), active: boolean(raw.active, 'Active', true) };
    case 'customers': return { name: text(raw.name, 'Name', 200, true), contactName: text(raw.contactName, 'Contact name', 160), ...contact(raw), address: text(raw.address, 'Address', 500), industry: text(raw.industry, 'Industry', 120), ...coords(raw), assignedRepId: identifier(raw.assignedRepId, 'Assigned rep', true), status: choice(raw.status, ['prospect', 'active', 'at_risk', 'inactive'], 'Status', 'prospect'), notes: notes(raw.notes) };
    case 'visits': return { customerId: identifier(raw.customerId, 'Customer'), repId: identifier(raw.repId, 'Rep'), occurredAt: timestamp(raw.occurredAt, 'Visit time'), ...coords(raw), notes: notes(raw.notes), actionTaken: text(raw.actionTaken, 'Action taken', 2000), nextStep: text(raw.nextStep, 'Next step', 2000), outcome: choice(raw.outcome, ['discovery', 'follow_up', 'proposal', 'won', 'lost', 'no_contact'], 'Outcome', 'discovery'), amount: number(raw.amount, 'Amount', { fallback: 0, max: 1e9 }), durationMinutes: number(raw.durationMinutes, 'Duration', { fallback: 0, max: 1440 }) };
    case 'appointments': { const startsAt = timestamp(raw.startsAt, 'Start time'), endsAt = timestamp(raw.endsAt, 'End time'); if (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 7 * 86400000) invalid('Appointment must end after its start within seven days'); return { customerId: identifier(raw.customerId, 'Customer'), repId: identifier(raw.repId, 'Rep'), startsAt, endsAt, title: text(raw.title, 'Title', 200, true), status: choice(raw.status, ['planned', 'completed', 'cancelled'], 'Status', 'planned'), notes: notes(raw.notes) }; }
    case 'targets': { const periodStart = date(raw.periodStart, 'Period start'), periodEnd = date(raw.periodEnd, 'Period end'); if (periodEnd < periodStart || Date.parse(periodEnd) - Date.parse(periodStart) > 366 * 86400000) invalid('Target period must be ordered and no longer than 366 days'); return { repId: identifier(raw.repId, 'Rep'), periodStart, periodEnd, visitGoal: number(raw.visitGoal, 'Visit goal', { integer: true, fallback: 0, max: 100000 }), salesGoal: number(raw.salesGoal, 'Sales goal', { fallback: 0, max: 1e9 }) }; }
    case 'routes': { if (!Array.isArray(raw.stopCustomerIds) || !raw.stopCustomerIds.length || raw.stopCustomerIds.length > 50) invalid('A route requires 1–50 ordered customer stops'); const stopCustomerIds = raw.stopCustomerIds.map(v => identifier(v, 'Route customer')); if (new Set(stopCustomerIds).size !== stopCustomerIds.length) invalid('Route stops must be unique'); return { repId: identifier(raw.repId, 'Rep'), name: text(raw.name, 'Route name', 200, true), visitDate: date(raw.visitDate, 'Route date'), stopCustomerIds, notes: notes(raw.notes) }; }
    case 'connectors': { const url = text(raw.url, 'Connector origin', 300, true); let parsed; try { parsed = new URL(url); } catch { invalid('Connector origin is invalid'); } if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') invalid('Connector URL must be an HTTPS origin without credentials, paths, queries or fragments'); return { name: text(raw.name, 'Connector name', 160, true), type: choice(raw.type, ['webhook', 'crm'], 'Connector type'), url: parsed.origin, deliveryEnabled: false }; }
    default: invalid('Unknown entity');
  }
}
