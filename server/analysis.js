// SPDX-License-Identifier: MIT OR Apache-2.0
// Copyright 2026 Ufuk Efe Kaya
/**
 * Pure, rule-based visit analysis, derived from the K1/K4 and relationship-health
 * algorithm families. Lexical matches describe recorded evidence, not verified
 * events, employee performance, fraud, AI inference or a certified risk rating.
 * Supply config.asOf to evaluate relationship health at a date other than this
 * visit. Nothing reads a database, the clock, credentials or external services.
 */

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Public demonstration defaults, not recovered business/customer thresholds. */
export const DEFAULT_ANALYSIS_CONFIG = freeze({
  asOf: null,
  history: {
    duplicateLookback: 12,
    duplicateMinimumLength: 32,
    duplicateSimilarity: 0.88,
    minimumTokenLength: 3,
    locationRadiusKm: 1.5,
    maximumTravelKmh: 160,
    repeatWindowDays: 45,
    repeatWithoutProgress: 5,
    minimumDurationMinutes: 3,
  },
  quality: {
    minimumNotesLength: 24,
    completeScore: 75,
    reviewScore: 45,
    weights: { notes: 16, action: 20, nextStep: 18, outcome: 12, document: 12, numeric: 10, location: 6, timestamp: 6 },
    penalties: { duplicate: 25, location: 20, travel: 15, shortDuration: 8, invalidTimestamp: 8, invalidLocation: 6 },
  },
  sales: {
    weights: { evidence: 4, action: 12, nextStep: 18, proposal: 15, won: 60, firstRecordedContact: 8 },
    penalties: { duplicate: 12, location: 8, travel: 6, repeatedWithoutProgress: 12, unaddressedFollowUp: 7 },
  },
  health: {
    weights: { recency: 0.4, intensity: 0.15, momentum: 0.2, quality: 0.25 },
    recencyHorizonDays: 60,
    recentWindowDays: 21,
    historyWindowDays: 84,
    growthRatio: 1.35,
    steadyRatio: 0.85,
    intensityGrowing: 92,
    intensitySteady: 68,
    intensityDeclining: 32,
    intensityWithoutBaseline: 55,
    unplannedMomentum: 45,
    undatedPlanMomentum: 70,
    overduePlanMomentum: 20,
    planHorizonDays: 30,
    plannedMomentumFloor: 60,
    decayGraceDays: 30,
    decayPointsPerDay: 0.65,
    healthyScore: 72,
    watchScore: 44,
  },
  lexicon: {
    action: ['sent proposal', 'delivered sample', 'performed demo', 'shared quotation', 'completed meeting', 'teklif gönderdim', 'numune bıraktım', 'demo yaptım', 'görüşme yaptım'],
    nextStep: ['follow up', 'call again', 'next week', 'next meeting', 'takip edeceğim', 'tekrar arayacağım', 'haftaya', 'randevu'],
    document: ['quotation', 'proposal', 'invoice', 'contract', 'purchase order', 'teklif', 'fatura', 'sözleşme', 'proforma'],
    proposal: ['quotation', 'proposal', 'quote requested', 'teklif'],
    won: ['order confirmed', 'order received', 'sale completed', 'contract signed', 'sipariş onaylandı', 'sipariş alındı', 'satış tamamlandı', 'sözleşme imzalandı'],
    negative: ['no order', 'not confirmed', 'order cancelled', 'order canceled', 'cancelled order', 'not sold', 'not yet', 'pending', 'expected', 'will be', 'next week', 'tomorrow', 'sipariş yok', 'sipariş alınamadı', 'sipariş iptal', 'iptal edildi', 'yarın', 'haftaya', 'bekleniyor', 'planlanıyor'],
    lost: ['opportunity lost', 'closed lost', 'deal lost', 'fırsat kaybedildi'],
    remote: ['remote meeting', 'phone call', 'video call', 'by email', 'uzaktan', 'telefon görüşmesi', 'telefonda', 'e-posta ile'],
    wonOutcomes: ['won', 'closed_won', 'order_confirmed', 'sold'],
    lostOutcomes: ['lost', 'closed_lost', 'cancelled', 'canceled'],
  },
});

const DAY_MS = 86_400_000;
const has = (value) => value !== null && value !== undefined && value !== '';
const text = (value) => typeof value === 'string' ? value.trim() : '';
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const normalize = (value) => text(value).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clamp = (value, max = 100) => Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));
const round = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

function number(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinates(lat, lng) {
  const a = number(lat), b = number(lng);
  return a !== null && b !== null && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null;
}

/** Returns kilometres, or null for missing, non-finite or out-of-range coordinates. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const a = coordinates(lat1, lng1), b = coordinates(lat2, lng2);
  if (!a || !b) return null;
  const radians = (v) => v * Math.PI / 180;
  const dLat = radians(b[0] - a[0]), dLng = radians(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(clamp(h, 1)));
}

// Accept an epoch in milliseconds, Date, ISO calendar date or zoned ISO timestamp.
// Reject impossible calendar dates and ambiguous host-local timestamps explicitly.
function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 8.64e15 ? value : null;
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const leap = +year % 4 === 0 && (+year % 100 !== 0 || +year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (+month < 1 || +month > 12 || +day < 1 || +day > monthDays[+month - 1] || +hour > 23 || +minute > 59 || +second > 59) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function settings(overrides, defaults = DEFAULT_ANALYSIS_CONFIG) {
  const input = record(overrides);
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const candidate = input[key];
    if (key === 'asOf') return [key, candidate === undefined ? fallback : candidate];
    if (Array.isArray(fallback)) return [key, Array.isArray(candidate) ? candidate.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()) : fallback];
    if (fallback && typeof fallback === 'object') return [key, settings(candidate, fallback)];
    return [key, typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? Math.min(candidate, 1_000_000) : fallback];
  }));
}

/**
 * Resolve the effective public configuration used by analyzeVisit. Unknown keys
 * are ignored; invalid numeric values fall back to defaults; lexicon arrays keep
 * only non-empty strings. An explicit invalid asOf is retained so analysis reports
 * unknown health instead of silently substituting a different reference date.
 */
export function resolveAnalysisConfig(config = {}) {
  return settings(config);
}

function compileLexicon(lexicon) {
  return Object.fromEntries(Object.entries(lexicon).map(([key, phrases]) => [key,
    key.endsWith('Outcomes') ? new Set(phrases.map(normalize)) : phrases.map(normalize).filter(Boolean).map((phrase) => ` ${phrase} `),
  ]));
}

function matchesNormalized(value, phrases) {
  const haystack = ` ${value} `;
  return phrases.some((phrase) => haystack.includes(phrase));
}

const hasId = (value) => (typeof value === 'string' && Boolean(value.trim())) || (typeof value === 'number' && Number.isFinite(value));

function sameId(a, b) {
  return hasId(a) && hasId(b) && a === b;
}

function lexicalEvidence(visit, config, lexicon) {
  const notes = text(visit.notes);
  const narrative = [notes, text(visit.actionTaken), text(visit.outcome)].filter(Boolean).join('. ');
  const normalizedNotes = normalize(notes), normalizedNarrative = normalize(narrative);
  const outcome = normalize(visit.outcome);
  const explicitWon = lexicon.wonOutcomes.has(outcome);
  const explicitLost = lexicon.lostOutcomes.has(outcome);
  // Negation is checked per sentence, so an earlier failed attempt does not erase
  // a separately recorded successful event. This is still a lexical heuristic.
  const sentences = narrative.match(/[^.!?;\n]+[.!?;\n]?/gu) || [];
  const won = !explicitLost && (explicitWon || sentences.some((sentence) => {
    const normalized = normalize(sentence);
    return !sentence.trim().endsWith('?') && matchesNormalized(normalized, lexicon.won) && !matchesNormalized(normalized, lexicon.negative);
  }));
  const lost = explicitLost || (!explicitWon && !won && matchesNormalized(normalizedNarrative, lexicon.lost));
  const evidence = {
    notes: notes.length >= config.quality.minimumNotesLength && notes.length > 0,
    action: Boolean(text(visit.actionTaken)) || matchesNormalized(normalizedNotes, lexicon.action),
    nextStep: Boolean(text(visit.nextStep)) || matchesNormalized(normalizedNotes, lexicon.nextStep),
    outcome: Boolean(text(visit.outcome)),
    document: matchesNormalized(normalizedNarrative, lexicon.document),
    numeric: (number(visit.amount) !== null && number(visit.amount) > 0) || /\d+(?:[.,]\d+)?\s*(?:%|units?\b|kg\b|hours?\b|adet\b|saat\b|usd\b|eur\b|try\b|₺|€|\$)/iu.test(narrative),
  };
  return {
    evidence, won, lost,
    proposal: matchesNormalized(normalizedNarrative, lexicon.proposal),
    followUp: outcome === 'follow up' || evidence.nextStep,
    remote: matchesNormalized(normalizedNarrative, lexicon.remote),
  };
}

function similarity(x, y) {
  if (!x.size || !y.size) return 0;
  const intersection = [...x].filter((v) => y.has(v)).length;
  return intersection / (x.size + y.size - intersection);
}

function add(reasons, label, delta) {
  reasons.push(`${label} (${delta >= 0 ? '+' : ''}${round(delta)}).`);
  return delta;
}

function baseQuality(visit, config, context) {
  const lexical = context.lexical(visit);
  let score = Object.entries(lexical.evidence).reduce((sum, [key, present]) => sum + (present ? config.quality.weights[key] : 0), 0);
  if (context.location(visit)) score += config.quality.weights.location;
  if (context.time(visit) !== null) score += config.quality.weights.timestamp;
  return clamp(score);
}

function relationshipHealth(visit, history, customer, currentQuality, config, context, aggregate = null) {
  const unknown = (reason) => ({ score: null, band: 'unknown', reasons: [reason] });
  if (!hasId(visit.customerId)) return unknown('A customer identifier is needed to scope relationship history.');
  const asOf = config.asOf === null || config.asOf === undefined ? context.time(visit) : context.asOf;
  if (asOf === null) return unknown('No valid reference date is available; use a zoned ISO config.asOf.');
  const candidates = aggregate ? null : [...history, { visit, time: context.time(visit), current: true }]
    .filter((entry) => entry.time !== null && entry.time <= asOf && sameId(entry.visit.customerId, visit.customerId))
    .sort((a, b) => b.time - a.time);
  const candidateCount = aggregate ? aggregate.candidateCount : candidates.length;
  if (!candidateCount) return unknown('No valid dated customer visits are available at the reference date.');
  const latest = aggregate ? aggregate.latest : candidates[0];
  const h = config.health, daysSince = (asOf - latest.time) / DAY_MS;
  const recentDays = Math.max(1, h.recentWindowDays), historyDays = Math.max(recentDays + 1, h.historyWindowDays);
  const recentCount = aggregate ? aggregate.recentCount : candidates.filter((v) => asOf - v.time <= recentDays * DAY_MS).length;
  const olderCount = aggregate ? aggregate.olderCount : candidates.filter((v) => asOf - v.time > recentDays * DAY_MS && asOf - v.time <= historyDays * DAY_MS).length;
  const ratio = olderCount ? (recentCount / recentDays) / (olderCount / (historyDays - recentDays)) : null;
  const recency = clamp(100 * (1 - daysSince / Math.max(1, h.recencyHorizonDays)));
  const intensity = ratio === null ? h.intensityWithoutBaseline : ratio >= h.growthRatio ? h.intensityGrowing : ratio >= h.steadyRatio ? h.intensitySteady : h.intensityDeclining;
  const planTime = timestamp(customer.nextFollowUpAt);
  const planDays = planTime === null ? null : (planTime - asOf) / DAY_MS;
  const latestHasPlan = context.lexical(latest.visit).evidence.nextStep;
  let momentum = latestHasPlan ? h.undatedPlanMomentum : h.unplannedMomentum;
  if (planDays !== null) momentum = planDays < 0 ? h.overduePlanMomentum : Math.max(h.plannedMomentumFloor, 100 - planDays / Math.max(1, h.planHorizonDays) * (100 - h.plannedMomentumFloor));
  const averageQuality = aggregate
    ? (aggregate.orderedQualitySum ? aggregate.orderedQualitySum(currentQuality) : aggregate.priorQualitySum + (aggregate.currentIncluded ? currentQuality : 0)) / candidateCount
    : candidates.reduce((sum, entry) => sum + (entry.current ? currentQuality : context.baseQuality(entry.visit)), 0) / candidateCount;
  const components = { recency, intensity: clamp(intensity), momentum: clamp(momentum), quality: averageQuality };
  const totalWeight = Object.values(h.weights).reduce((a, b) => a + b, 0);
  if (!totalWeight) return unknown('Health component weights are all zero.');
  const weighted = Object.entries(components).reduce((sum, [key, value]) => sum + value * h.weights[key], 0) / totalWeight;
  const decay = Math.max(0, daysSince - h.decayGraceDays) * h.decayPointsPerDay;
  const score = Math.round(clamp(weighted - decay));
  return {
    score,
    band: score >= Math.max(h.healthyScore, h.watchScore) ? 'healthy' : score >= Math.min(h.watchScore, h.healthyScore) ? 'watch' : 'attention',
    reasons: [
      `Recency: ${round(daysSince)} days since the latest recorded visit; component ${round(recency)}/100.`,
      `Activity trend: ${recentCount} recent and ${olderCount} earlier visits; ${ratio === null ? 'no earlier baseline' : `rate ratio ${round(ratio)}`}; component ${round(components.intensity)}/100.`,
      `Planning: ${planDays === null ? (latestHasPlan ? 'an undated next step is recorded' : 'no next step is recorded') : `${round(planDays)} days to the recorded follow-up`}; component ${round(components.momentum)}/100.`,
      `Mean recorded quality: ${round(averageQuality)}/100 over ${candidateCount} visits; historical visits use lexical quality before contextual penalties.`,
      `Configured age decay: ${round(decay)} points. This is a rule-based relationship indicator.`,
    ],
  };
}

/**
 * Analyze a generic visit without mutating inputs. History comparisons require
 * matching explicit IDs and strictly older valid timestamps. Zero coordinates
 * are valid. Missing/invalid data is never treated as location verification.
 * quality/sales.score are 0–100; health.score is null when the band is unknown.
 */
function analyzeWithContext(input, options, config, context, indexed = null) {
  const visit = record(input), args = record(options);
  const customerInput = record(args.customer);
  const customer = !has(customerInput.id) || sameId(customerInput.id, visit.customerId) ? customerInput : {};
  const time = context.time(visit), location = context.location(visit);
  const history = indexed ? [] : (Array.isArray(args.priorVisits) ? args.priorVisits : [])
    .filter((v) => v !== input && v && typeof v === 'object' && !Array.isArray(v))
    .map((v) => ({ visit: v, time: context.time(v) }))
    .filter((entry) => time !== null && entry.time !== null && entry.time < time)
    .sort((a, b) => b.time - a.time);
  const sameRep = history.filter((v) => sameId(v.visit.repId, visit.repId));
  const sameCustomer = history.filter((v) => sameId(v.visit.customerId, visit.customerId));
  const sameCustomerCount = indexed ? indexed.sameCustomerCount : sameCustomer.length;
  const lexical = context.lexical(visit), qReasons = [], sReasons = [];
  const duration = number(visit.durationMinutes);
  const comparisonRecords = indexed ? indexed.comparisonRecords : sameRep.filter((v) => text(v.visit.notes).length >= config.history.duplicateMinimumLength)
    .slice(0, Math.floor(config.history.duplicateLookback));
  const duplicateSimilarity = text(visit.notes).length >= config.history.duplicateMinimumLength
    ? comparisonRecords.reduce((maximum, v) => Math.max(maximum, similarity(context.tokens(visit), context.tokens(v.visit))), 0) : 0;
  const duplicate = comparisonRecords.length > 0 && text(visit.notes).length >= config.history.duplicateMinimumLength && duplicateSimilarity >= clamp(config.history.duplicateSimilarity, 1);
  const previousLocation = indexed ? indexed.previousCustomerLocation : sameCustomer.find((v) => context.location(v.visit));
  const referenceLocation = coordinates(customer.lat, customer.lng) || (previousLocation && context.location(previousLocation.visit));
  const distanceKm = location && referenceLocation ? haversineKm(...location, ...referenceLocation) : null;
  const locationAnomaly = !lexical.remote && distanceKm !== null && distanceKm > config.history.locationRadiusKm;
  const previousRepLocation = indexed ? indexed.previousRepLocation : sameRep.find((v) => context.location(v.visit));
  const travelDistance = location && previousRepLocation ? haversineKm(...context.location(previousRepLocation.visit), ...location) : null;
  const travelSpeedKmh = travelDistance !== null ? travelDistance / ((time - previousRepLocation.time) / 3_600_000) : null;
  const travelAnomaly = !lexical.remote && travelSpeedKmh !== null && travelSpeedKmh > config.history.maximumTravelKmh;
  const repeatCount = (indexed ? indexed.repeatedNonWonCount : sameCustomer.filter((entry) => time - entry.time <= config.history.repeatWindowDays * DAY_MS && !context.lexical(entry.visit).won).length) + (lexical.won ? 0 : 1);
  const repeatedWithoutProgress = hasId(visit.customerId) && !lexical.won && repeatCount >= config.history.repeatWithoutProgress;
  const previousCustomer = indexed ? indexed.previousCustomer : sameCustomer[0];
  const unaddressedFollowUp = Boolean(previousCustomer && context.lexical(previousCustomer.visit).evidence.nextStep && !lexical.evidence.action && !lexical.evidence.nextStep && !lexical.won);
  let qScore = 0;
  const labels = { notes: 'Detailed notes recorded', action: 'Action recorded or matched lexically', nextStep: 'Next step recorded or matched lexically', outcome: 'Outcome recorded', document: 'Document reference matched lexically', numeric: 'Positive amount or numeric unit recorded' };
  for (const [key, present] of Object.entries(lexical.evidence)) if (present) qScore += add(qReasons, labels[key], config.quality.weights[key]);
  if (location) qScore += add(qReasons, 'Finite, in-range coordinates recorded; attendance is unverified', config.quality.weights.location);
  if (time !== null) qScore += add(qReasons, 'Valid timestamp recorded', config.quality.weights.timestamp);
  else qScore += add(qReasons, 'Missing or invalid timestamp; chronological comparisons skipped', -config.quality.penalties.invalidTimestamp);
  const invalidLocation = (has(visit.lat) || has(visit.lng)) && !location;
  if (invalidLocation) qScore += add(qReasons, 'Incomplete, non-finite or out-of-range coordinates', -config.quality.penalties.invalidLocation);
  const penalties = [
    [duplicate, 'Narrative resembles an earlier record; review reused text', 'duplicate'],
    [locationAnomaly, 'Location differs from the supplied customer reference; review context', 'location'],
    [travelAnomaly, 'Travel speed between recorded locations exceeds the configured threshold', 'travel'],
  ];
  for (const [active, label, key] of penalties) if (active) qScore += add(qReasons, label, -config.quality.penalties[key]);
  if (duration !== null && duration >= 0 && duration < config.history.minimumDurationMinutes) qScore += add(qReasons, 'Recorded duration is below the configured minimum', -config.quality.penalties.shortDuration);
  if (has(visit.durationMinutes) && (duration === null || duration < 0)) qReasons.push('Duration is invalid and was excluded.');
  if (!lexical.evidence.notes) qReasons.push('Notes have insufficient detail for the configured length check.');
  if (lexical.remote && location) qReasons.push('Remote-contact wording suppresses location and travel anomaly flags.');
  qScore = Math.round(clamp(qScore));
  let sScore = 0;
  const evidenceCount = Object.values(lexical.evidence).filter(Boolean).length;
  if (evidenceCount) sScore += add(sReasons, `${evidenceCount} recorded evidence signals; lexical matches are unverified`, evidenceCount * config.sales.weights.evidence);
  if (lexical.evidence.action) sScore += add(sReasons, 'Action recorded', config.sales.weights.action);
  if (lexical.evidence.nextStep) sScore += add(sReasons, 'Follow-up step recorded', config.sales.weights.nextStep);
  if (lexical.proposal && !lexical.won && !lexical.lost) sScore += add(sReasons, 'Proposal wording detected', config.sales.weights.proposal);
  if (lexical.won) sScore += add(sReasons, 'Won outcome or affirmative completion wording recorded; no payment verified', config.sales.weights.won);
  if (hasId(visit.customerId) && !sameCustomerCount && time !== null) sScore += add(sReasons, 'First contact in the supplied dated customer history', config.sales.weights.firstRecordedContact);
  for (const [active, label, key] of penalties) if (active) sScore += add(sReasons, label, -config.sales.penalties[key]);
  if (repeatedWithoutProgress) sScore += add(sReasons, 'Repeated recent contacts have no recorded completed sale', -config.sales.penalties.repeatedWithoutProgress);
  if (unaddressedFollowUp) sScore += add(sReasons, 'An earlier plan has no explicit action or renewed plan in this record', -config.sales.penalties.unaddressedFollowUp);
  if (lexical.lost) sReasons.push('A lost or cancelled outcome is recorded; the score describes recorded activity, not employee performance.');
  if (!sReasons.length) sReasons.push('No configured sales or follow-up evidence was recorded.');
  const needsReview = duplicate || locationAnomaly || travelAnomaly || invalidLocation || time === null;
  const completeThreshold = Math.max(config.quality.completeScore, config.quality.reviewScore);
  const reviewThreshold = Math.min(config.quality.reviewScore, config.quality.completeScore);
  const quality = {
    score: qScore,
    status: qScore >= completeThreshold && !needsReview ? 'complete' : qScore >= reviewThreshold ? 'review' : 'incomplete',
    reasons: qReasons,
    metrics: {
      evidenceCount, evidence: { ...lexical.evidence },
      duplicateSimilarity: round(duplicateSimilarity, 4), duplicateComparisonCount: comparisonRecords.length, duplicateNarrative: duplicate,
      distanceKm: round(distanceKm, 3), travelSpeedKmh: round(travelSpeedKmh, 2), locationAnomaly, travelAnomaly,
      locationStatus: !location ? (invalidLocation ? 'invalid' : 'missing') : lexical.remote ? 'remote' : locationAnomaly ? 'anomaly' : referenceLocation ? 'consistent' : 'recorded',
      remoteContact: lexical.remote, validTimestamp: time !== null,
      durationMinutes: duration !== null && duration >= 0 ? duration : null,
      sameCustomerVisits: sameCustomerCount, repeatedWithoutProgress, unaddressedFollowUp,
    },
  };
  return {
    quality,
    sales: { score: Math.round(clamp(sScore)), stage: lexical.won ? 'won' : lexical.lost ? 'lost' : lexical.proposal ? 'proposal' : lexical.followUp ? 'follow_up' : 'discovery', reasons: sReasons },
    health: relationshipHealth(visit, history, customer, qScore, config, context, indexed?.healthAggregate),
  };
}

// Time bounds operate on stable ascending indexes. An upper bound includes a
// timestamp; a lower bound excludes it, preserving strictly-older history at ties.
function timeBound(entries, time, upper = false) {
  let low = 0, high = entries.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (entries[middle].time < time || (upper && entries[middle].time === time)) low = middle + 1;
    else high = middle;
  }
  return low;
}

function newHistoryIndex() {
  return { entries: [], groups: [], locations: [], duplicates: [], qualityPrefix: [0], qualityValues: [], fractionalPrefix: [0], nonWonPrefix: [0] };
}

function appendHistory(index, entry, config, context, customerIndex) {
  index.entries.push(entry);
  // The first input record at a tied timestamp wins stable descending-history
  // lookup, not the last record appended to an ascending index.
  if (index.groups.at(-1)?.time !== entry.time) index.groups.push({ time: entry.time, entry, start: index.entries.length - 1, end: index.entries.length });
  else index.groups.at(-1).end = index.entries.length;
  if (context.location(entry.visit) && index.locations.at(-1)?.time !== entry.time) index.locations.push({ time: entry.time, entry });
  if (text(entry.visit.notes).length >= config.history.duplicateMinimumLength) {
    if (index.duplicates.at(-1)?.time !== entry.time) index.duplicates.push({ time: entry.time, entries: [] });
    index.duplicates.at(-1).entries.push(entry);
  }
  if (customerIndex) {
    const quality = context.baseQuality(entry.visit);
    index.qualityValues.push(quality);
    index.qualityPrefix.push(index.qualityPrefix.at(-1) + quality);
    index.fractionalPrefix.push(index.fractionalPrefix.at(-1) + (Number.isInteger(quality) ? 0 : 1));
    index.nonWonPrefix.push(index.nonWonPrefix.at(-1) + (context.lexical(entry.visit).won ? 0 : 1));
  }
}

function latestIndexed(groups, time, upper = false) {
  return groups[timeBound(groups, time, upper) - 1]?.entry;
}

function indexedDuplicates(index, time, limit) {
  const result = [];
  for (let group = index ? timeBound(index.duplicates, time) - 1 : -1; group >= 0 && result.length < limit; group--) {
    for (const entry of index.duplicates[group].entries) {
      if (result.length >= limit) break;
      result.push(entry);
    }
  }
  return result;
}

function orderedQualitySum(index, end, initial) {
  let sum = initial;
  if (!end) return sum;
  for (let group = timeBound(index.groups, index.entries[end - 1].time, true) - 1; group >= 0; group--) {
    const current = index.groups[group];
    for (let i = current.start; i < Math.min(current.end, end); i++) sum += index.qualityValues[i];
  }
  return sum;
}

function healthAggregate(index, entry, end, config, context) {
  const asOf = config.asOf === null || config.asOf === undefined ? entry.time : context.asOf;
  const empty = { candidateCount: 0, recentCount: 0, olderCount: 0, priorQualitySum: 0, currentIncluded: false };
  if (!index || entry.time === null || asOf === null) return empty;
  const priorEnd = Math.min(end, timeBound(index.entries, asOf, true));
  const currentIncluded = entry.time <= asOf;
  const h = config.health, recentDays = Math.max(1, h.recentWindowDays);
  const historyDays = Math.max(recentDays + 1, h.historyWindowDays);
  const recentStart = asOf - recentDays * DAY_MS, historyStart = asOf - historyDays * DAY_MS;
  const recentBound = Math.min(priorEnd, timeBound(index.entries, recentStart));
  const historyBound = Math.min(priorEnd, timeBound(index.entries, historyStart));
  const currentAge = asOf - entry.time;
  return {
    candidateCount: priorEnd + (currentIncluded ? 1 : 0),
    latest: currentIncluded ? entry : latestIndexed(index.groups, asOf, true),
    recentCount: priorEnd - recentBound + (currentIncluded && currentAge <= recentDays * DAY_MS ? 1 : 0),
    olderCount: recentBound - historyBound + (currentIncluded && currentAge > recentDays * DAY_MS && currentAge <= historyDays * DAY_MS ? 1 : 0),
    priorQualitySum: index.qualityPrefix[priorEnd],
    // Addition of arbitrary fractional weights is not associative in IEEE-754.
    // Preserve the standalone stable descending order for that exceptional path;
    // integer/default quality values use the constant-time prefix sum above.
    orderedQualitySum: index.fractionalPrefix[priorEnd] ? (currentQuality) => orderedQualitySum(index, priorEnd, currentIncluded ? currentQuality : 0) : null,
    currentIncluded,
  };
}

function analyzeBatch(inputs, options, config, context) {
  const records = Array.isArray(inputs) ? inputs : [];
  const customerById = record(options).customerById instanceof Map ? options.customerById : new Map();
  const entries = records.map((input, position) => {
    const visit = record(input);
    return { input, visit, position, time: context.time(visit) };
  });
  const sorted = entries.filter((entry) => entry.time !== null).sort((a, b) => a.time - b.time || a.position - b.position);
  const customers = new Map(), reps = new Map();
  for (const entry of sorted) {
    const { customerId, repId } = entry.visit;
    if (hasId(customerId)) {
      if (!customers.has(customerId)) customers.set(customerId, newHistoryIndex());
      appendHistory(customers.get(customerId), entry, config, context, true);
    }
    if (hasId(repId)) {
      if (!reps.has(repId)) reps.set(repId, newHistoryIndex());
      appendHistory(reps.get(repId), entry, config, context, false);
    }
  }
  return entries.map((entry) => {
    const customer = customers.get(entry.visit.customerId), rep = reps.get(entry.visit.repId);
    const end = customer && entry.time !== null ? timeBound(customer.entries, entry.time) : 0;
    const repeatStart = customer && entry.time !== null ? timeBound(customer.entries, entry.time - config.history.repeatWindowDays * DAY_MS) : 0;
    const indexed = {
      sameCustomerCount: end,
      comparisonRecords: entry.time === null ? [] : indexedDuplicates(rep, entry.time, Math.floor(config.history.duplicateLookback)),
      previousCustomer: customer && entry.time !== null ? latestIndexed(customer.groups, entry.time) : undefined,
      previousCustomerLocation: customer && entry.time !== null ? latestIndexed(customer.locations, entry.time) : undefined,
      previousRepLocation: rep && entry.time !== null ? latestIndexed(rep.locations, entry.time) : undefined,
      repeatedNonWonCount: customer ? customer.nonWonPrefix[end] - customer.nonWonPrefix[repeatStart] : 0,
      healthAggregate: healthAggregate(customer, entry, end, config, context),
    };
    return analyzeWithContext(entry.input, { customer: customerById.get(entry.visit.customerId) }, config, context, indexed);
  });
}

/**
 * Create once per immutable snapshot, then analyze all of that snapshot's visits.
 * Configuration is fixed for this instance; per-call options are priorVisits and
 * customer. WeakMap caches reuse record evidence, quality, timestamps, coordinates
 * and note tokens without truncating history. Discard the analyzer after a
 * snapshot; create a new one after editing input records or changing configuration.
 * Returned analyses and reported config do not expose mutable internal caches.
 * analyzeChronological(visits, { customerById: Map }) indexes the complete batch
 * once and returns analyses aligned to input order, including unsorted input.
 */
export function createVisitAnalyzer(overrides = {}) {
  const config = resolveAnalysisConfig(overrides), lexicon = compileLexicon(config.lexicon);
  const lexicalCache = new WeakMap(), qualityCache = new WeakMap(), timeCache = new WeakMap();
  const locationCache = new WeakMap(), tokenCache = new WeakMap();
  const cached = (cache, input, compute) => {
    if (!cache.has(input)) cache.set(input, compute(input));
    return cache.get(input);
  };
  const context = {
    asOf: timestamp(config.asOf),
    lexical: (input) => cached(lexicalCache, input, (v) => lexicalEvidence(v, config, lexicon)),
    time: (input) => cached(timeCache, input, (v) => timestamp(v.occurredAt)),
    location: (input) => cached(locationCache, input, (v) => coordinates(v.lat, v.lng)),
    tokens: (input) => cached(tokenCache, input, (v) => new Set(normalize(v.notes).split(' ').filter((word) => word && word.length >= Math.max(1, config.history.minimumTokenLength)))),
    baseQuality: (input) => cached(qualityCache, input, (v) => baseQuality(v, config, context)),
  };
  return {
    config: resolveAnalysisConfig(config),
    analyzeVisit: (input, options = {}) => analyzeWithContext(input, options, config, context),
    /** Results align with input order; all records form the available history. */
    analyzeChronological: (inputs, options = {}) => analyzeBatch(inputs, options, config, context),
  };
}

/** Analyze one visit with fresh request-local caches and the original API. */
export function analyzeVisit(input, options = {}) {
  return createVisitAnalyzer(record(options).config).analyzeVisit(input, options);
}
