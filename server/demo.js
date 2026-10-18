// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
// Entirely fictional, deterministic public demonstration; no imported records.
export const DEMO_LABEL = 'Fictional demo records, fixed October 2026 timeline';
export function seedDemo(store) {
  const repIds = ['rep-demo-1', 'rep-demo-2', 'rep-demo-3'];
  ['Alex Example', 'Jordan Example', 'Riley Example'].forEach((name, i) => store.create('reps', { name, email: `rep${i + 1}@example.test`, phone: '', region: ['North demo', 'West demo', 'Central demo'][i], active: true }, { id: repIds[i] }));
  const customerIds = Array.from({ length: 6 }, (_, i) => `customer-demo-${i + 1}`);
  customerIds.forEach((id, i) => store.create('customers', { name: `Example ${['Manufacturing A', 'Research B', 'Packaging C', 'Components D', 'Workshop E', 'Logistics F'][i]}`, contactName: `Contact Example ${i + 1}`, email: `contact${i + 1}@example.test`, phone: '', address: `${i + 1} Fictional Example Way`, industry: ['manufacturing', 'research', 'packaging'][i % 3], lat: 35 + i * 0.01, lng: -100 + i * 0.01, assignedRepId: repIds[i % 3], status: i === 4 ? 'at_risk' : i < 4 ? 'active' : 'prospect', notes: 'Fictional public demo customer. No real business or location is implied.' }, { id }));
  const outcomes = ['discovery', 'follow_up', 'proposal', 'won', 'lost', 'no_contact', 'follow_up', 'proposal', 'won'];
  outcomes.forEach((outcome, i) => {
    const ci = i % 6, hour = 9 + i % 6;
    store.create('visits', { customerId: customerIds[ci], repId: repIds[ci % 3], occurredAt: `2026-10-${String(10 + Math.floor(i / 3)).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`, lat: 35 + ci * 0.01, lng: -100 + ci * 0.01,
      notes: i === 5 ? 'No contact.' : `Reviewed ${3 + i} sample components with the fictional procurement contact. Discussed delivery schedule and capacity for the demonstration.`, actionTaken: i === 5 ? '' : 'Discussed requirements and prepared a sample comparison.', nextStep: i === 5 ? '' : 'Send the revised quotation and call the example contact on the agreed follow-up date.', outcome, amount: outcome === 'won' ? (i + 1) * 250 : 0, durationMinutes: i === 5 ? 2 : 20 + i }, { id: `visit-demo-${i + 1}` });
  });
  for (let i = 0; i < 3; i++) store.create('appointments', { customerId: customerIds[i], repId: repIds[i], startsAt: `2026-10-${20 + i}T10:00:00Z`, endsAt: `2026-10-${20 + i}T10:45:00Z`, title: 'Fictional follow-up meeting', status: 'planned', notes: 'Public demo appointment; no invitation or notification is sent.' }, { id: `appointment-demo-${i + 1}` });
  repIds.forEach((repId, i) => store.create('targets', { repId, periodStart: '2026-10-01', periodEnd: '2026-10-31', visitGoal: 12 + i * 3, salesGoal: 4000 + i * 1000 }, { id: `target-demo-${i + 1}` }));
  store.create('routes', { repId: repIds[0], name: 'Example north route', visitDate: '2026-10-20', stopCustomerIds: [customerIds[0], customerIds[3]], notes: 'Ordered customer stops; no live map or navigation service is contacted.' }, { id: 'route-demo-1' });
  store.create('connectors', { name: 'Example connector metadata', type: 'crm', url: 'https://crm.example.test' }, { id: 'connector-demo-1' });
}
