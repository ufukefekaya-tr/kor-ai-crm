// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
import { createVisitAnalyzer, haversineKm } from './analysis.js';
export const ANALYSIS_LIMITATIONS = Object.freeze([
  'Explainable lexical and location data-quality signals support human review; they do not establish employee honesty, fraud, intent or performance.',
  'GPS is recorded data, not verified presence. Sales and customer-health scores are configurable heuristics, not forecasts or financial advice.',
  'No messages, notifications, invitations, webhooks or autonomous actions are dispatched.',
]);
export function analysisSnapshot(store, { asOf = new Date().toISOString(), config = {} } = {}) {
  const analyzer = createVisitAnalyzer({ ...config, asOf });
  const effectiveConfig = analyzer.config;
  const customers = store.all('customers'), reps = store.all('reps');
  const customerById = new Map(customers.map(v => [v.id, v]));
  const repById = new Map(reps.map(v => [v.id, v]));
  const chronological = store.all('visits').sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const analyses = analyzer.analyzeChronological(chronological, { customerById });
  const analyzed = chronological.map((visit, index) => ({ ...visit, customerName: customerById.get(visit.customerId)?.name || '', repName: repById.get(visit.repId)?.name || '', analysis: analyses[index] }));
  const visits = analyzed.reverse();
  const referenceTime = new Date(asOf).getTime();
  const health = customers.map(customer => {
    // A future-dated record cannot replace the latest actual history at asOf.
    const latest = visits.find(v => v.customerId === customer.id && Date.parse(v.occurredAt) <= referenceTime);
    return { customerId: customer.id, customerName: customer.name, latestVisitAt: latest?.occurredAt || null,
      ...(latest?.analysis.health || { score: null, band: 'unknown', reasons: ['No dated visit history is available.'] }) };
  });
  return { visits, customers: health, config: effectiveConfig, limitations: ANALYSIS_LIMITATIONS, generatedAt: asOf };
}
export function routeDetails(route, store) {
  const customers = route.stopCustomerIds.map(id => store.get('customers', id));
  const missingCoordinates = customers.filter(v => v.lat === null || v.lng === null).map(v => v.id);
  let distanceKm = missingCoordinates.length ? null : 0;
  if (distanceKm !== null) for (let i = 1; i < customers.length; i++) distanceKm += haversineKm(customers[i - 1].lat, customers[i - 1].lng, customers[i].lat, customers[i].lng);
  return { ...route, stops: customers.map(v => ({ customerId: v.id, name: v.name, lat: v.lat, lng: v.lng })), distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100, missingCoordinates,
    distanceMethod: 'straight-line between ordered recorded coordinates; not road routing' };
}
export function summarize(store, options = {}) {
  const snapshot = options.snapshot || analysisSnapshot(store, options), visits = snapshot.visits;
  const reps = store.all('reps'), appointments = store.all('appointments');
  const sales = visits.filter(v => v.outcome === 'won');
  const counts = Object.fromEntries(['customers', 'reps', 'visits', 'appointments', 'routes', 'targets'].map(kind => [kind, store.count(kind)]));
  const sum = values => values.reduce((total, value) => total + value, 0);
  const dayCounts = new Map(); for (const visit of visits) { const day = visit.occurredAt.slice(0, 10); dayCounts.set(day, (dayCounts.get(day) || 0) + 1); }
  const health = { healthy: 0, watch: 0, atRisk: 0, unknown: 0 };
  for (const customer of snapshot.customers) health[customer.band === 'attention' ? 'atRisk' : customer.band in health ? customer.band : 'unknown']++;
  const targets = store.all('targets').map(target => {
    const inPeriod = visits.filter(v => v.repId === target.repId && v.occurredAt.slice(0, 10) >= target.periodStart && v.occurredAt.slice(0, 10) <= target.periodEnd);
    const actualVisits = inPeriod.length, actualSales = sum(inPeriod.filter(v => v.outcome === 'won').map(v => v.amount));
    return { ...target, repName: reps.find(r => r.id === target.repId)?.name || '', actualVisits, actualSales,
      visitProgress: target.visitGoal ? Math.round(actualVisits / target.visitGoal * 100) : null, salesProgress: target.salesGoal ? Math.round(actualSales / target.salesGoal * 100) : null };
  });
  return { counts, sales: { totalAmount: sum(sales.map(v => v.amount)), orders: sales.length, currency: 'unspecified' },
    quality: { averageScore: visits.length ? Math.round(sum(visits.map(v => v.analysis.quality.score)) / visits.length) : null,
      flaggedVisits: visits.filter(v => v.analysis.quality.status !== 'complete').length }, health,
    charts: { visitsByDay: [...dayCounts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      visitsByRep: reps.map(rep => ({ repId: rep.id, name: rep.name, count: visits.filter(v => v.repId === rep.id).length })),
      salesByRep: reps.map(rep => ({ repId: rep.id, name: rep.name, amount: sum(sales.filter(v => v.repId === rep.id).map(v => v.amount)) })) },
    recentVisits: visits.slice(0, 10), targets, upcomingAppointments: appointments.filter(v => v.status === 'planned' && v.endsAt >= snapshot.generatedAt).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 10),
    customerHealth: snapshot.customers, generatedAt: snapshot.generatedAt, limitations: snapshot.limitations };
}
