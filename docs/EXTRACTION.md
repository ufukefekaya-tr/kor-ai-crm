# Public extraction and source provenance

This repository is a clean, standalone reconstruction of the reusable CRM behavior in an earlier privately deployed AgentsHUB/KOR application. The production application was inspected read-only. Its databases, credentials, customer records, conversations, agent cells, embeddings, exports, reports, logs, backups, host settings, and Git history were not imported.

The public implementation is original owned code released by Ufuk Efe Kaya under MIT OR Apache-2.0. Dependency licenses and notices remain separate. The source fingerprints below identify the inspected files without publishing private server paths or their contents.

| Inspected source | SHA-256 | Recovered method |
| --- | --- | --- |
| `k1_filter.js` | `1c9ad0ab089de0a418e719e3bf9dafe21070d0d9ec2e5b0053993879f475b027` | Lines 25–127, 185–225, 277–317: concrete evidence, token-set similarity, follow-up and distance checks |
| `k4_engine.cjs` | `00999242c2bbfc522705a497e86386034f5de237450da563cac7ad96739c79e1` | Lines 14–27, 50–93, 106–174: completed-order wording, negation, sales/follow-up contributions |
| `dashboard_api.cjs` | `e634163262d3439035e1f5e13dcf621dcbe460f1c4c0cf08f4ba512f55a46cc0` | Lines 537–607: customer recency, activity, momentum, quality, and age decay |
| `satis_data/db_init.js` | `f7cfcdedfd81ee4c2a00e9d3e065e05adff6a72bd674e947c289d1379501f084` | Lines 24–85: customer, visit, report, and reminder schema concepts; customer-JSON loading at lines 87–108 excluded |
| `master_data_sync.cjs` | `0549cc0cc8d151999be4e4b2f92732c7736f56bdb0954833c16f763a0a59710d` | Contact/location relationships; production synchronization excluded |
| `setup_ajanda.cjs` | `71e69919448933fb12c828c74a568999b131e8c81ba2a19c664e4ffeb7ae96cb` | Appointment schema concept |
| `setup_hedefler.cjs` | `61c2e31c4661036a07ab7851c0144db30a08f2e22f5a5f67efab0593fb359a55` | Representative target schema concept |
| `connector_hub.cjs` | `a866851ce537c47fdf567eac00687b0ccd47fd072f2cdf3e1c5056135cb8b3de` | Connector registry concept; authentication secrets and delivery excluded |

## Working public scope

The CRM supports customer/contact and representative records, visits, appointments, targets, ordered customer routes, dashboard totals/charts, and SSE change announcements. Routes report straight-line distance between recorded coordinates; they do not call a mapping or navigation service. Exact repeat visit submissions are rejected. Similar narratives and GPS inconsistencies remain separate records with explainable review signals.

K1-style evidence checks and K4-style scoring were rewritten with neutral, configurable public defaults. The engine reports contributions, penalties, data gaps and scope. Customer health combines recorded recency, activity, next-step evidence and quality. Complete available customer/rep history is retained up to the store's 5,000-visit cap; the duplicate-narrative window is separately configurable. A per-snapshot analyzer caches record evidence and base quality so health calculations do not repeatedly parse the same historical notes. API requests reuse an unchanged snapshot within its reference minute; every successful write, configuration change or new minute invalidates it without a background timer. Explicit programmatic clocks retain exact timestamp keys. Customer health uses the latest visit at or before its reference time; future records do not replace that history.

The deterministic demo is explicit (`CRM_DEMO=true`), fictional, fixed to an October 2026 timeline, and inserted only into an empty database. All example contacts use reserved `example.test` addresses. Existing nonempty databases are never reseeded. The normal default is an empty workspace.

The analyst, planner and coach return deterministic, read-only summary templates by default. They do not interpret questions as real AI reasoning. Optional Gemini requires all of `CRM_AI_ENABLED=true`, `CRM_AI_MODEL`, and `GEMINI_API_KEY`; it runs only after an explicit chat request, receives aggregate CRM counts rather than customer/contact records, and has no tools that mutate the CRM. No provider call occurs during import or app construction.

Skills are reviewed metadata, with their exact retained/excluded scope documented in [SKILLS.md](SKILLS.md). Connector records are metadata only: HTTPS origin, name and type. Credentials, URL paths/queries and delivery enablement are not accepted. Telegram, messaging, email, webhooks, live synchronization, autonomous dispatch, simulation clock patches, external memory, desktop automation and production maintenance scripts are not included as functioning integrations.

## Configuration and bounds

`createApp(options)` in `server/app.js` creates an application without a listener, background timers, notifications or provider calls. `server/index.js` is the explicit process entry point. The default listener is `127.0.0.1:4320`. A non-loopback host requires an API token. Explicit origins and Host checks apply before API parsing/mutation; a configured token is accepted through `X-API-Key` or `Authorization: Bearer …`. The server serves the locally built `dist/` frontend and never exposes environment files or databases.

Record limits: 2,000 customers, 200 representatives, 5,000 visits, 2,000 appointments, 1,000 targets, 500 routes, and 100 connector metadata entries. JSON request bodies are limited to 64 KiB. Notes are limited to 4,000 characters; visit action and next-step fields to 2,000 each. List endpoints default to 100 records and accept at most 500 per page. Routes contain 1–50 unique ordered customer IDs. Active SSE connections are limited to 16; notifications contain entity/action/ID metadata only and have no persistent replay history.

Coordinates must be finite numeric latitude/longitude pairs within ±90/±180, or both null. Zoned ISO timestamps must represent real calendar dates and normalize into four-digit years. Amounts and target sales goals are finite, nonnegative and at most 1 billion unspecified currency units. Durations are 0–1,440 minutes. Appointments must end after their start within seven days. Target date ranges must be ordered and at most 366 days. Reference integrity prevents deleting records still used elsewhere. SQLite storage is additionally capped at 16,384 pages (64 MiB with its default 4 KiB page size).

Thresholds can be set programmatically, without assuming a settings UI or silently changing business constants:

```js
import { createApp } from './server/app.js';

const app = createApp({
  analysisConfig: {
    history: { duplicateSimilarity: 0.9, maximumTravelKmh: 140 },
    quality: { completeScore: 80 },
    health: { recentWindowDays: 28, historyWindowDays: 112 },
  },
});
```

`GET /api/analysis` reports the effective merged configuration actually used. Unknown configuration keys are ignored, invalid numeric overrides fall back to defaults, and lexicon overrides retain only nonempty strings. Pure engine callers can use `resolveAnalysisConfig`, `analyzeVisit`, or `createVisitAnalyzer` from `server/analysis.js`; a factory is scoped to one immutable snapshot. API inputs are validated independently and cannot write analysis configuration.

Scores are lexical and geometric heuristics for human review. They do not verify attendance, payment, intent, employee honesty, fraud, safety, future sales or physical feasibility. No time, location, sales or quality signal authorizes an automatic action.

## Performance validation

An isolated local validation on 2026-10-18 used Node 24.16.0, an in-memory database, and 5,000 newly constructed fictional visits under the same customer and representative. Only these aggregate timings are retained; the large benchmark fixture and database are not committed.

| Operation | Observed elapsed time | Coverage |
| --- | ---: | --- |
| Indexed engine batch, final test run | 644 ms | All 5,000 records; 4,999 prior records for the latest visit; health quality over all 5,000 |
| First HTTP `GET /api/summary` | 1,367 ms | Entire 5,000-visit workspace analyzed and summarized |
| Ten HTTP visit pages after that summary | 1,034 ms total | 500 records per page; all 5,000 rows returned through the unchanged-snapshot cache |

The automated suite checks exact batch/standalone equivalence, mixed identities, tied timestamps, future/reference-date handling, fractional weights, 5,000-record history coverage, and a 1,000-record API regression covering pagination-cache reuse and write invalidation. Run `node --test tests/analysis.test.js tests/api.test.js` with Node 24. Observed local timings describe this validation run rather than a latency guarantee.
