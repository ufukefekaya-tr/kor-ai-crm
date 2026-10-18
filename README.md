# KOR AI CRM

**A local field-sales workspace with explainable visit analysis.**

Manage customer relationships, representatives, visits, appointments, routes and
sales targets in a self-contained workspace. Review data-quality signals and
customer follow-up indicators, then ask read-only analyst, planner and coach agents
for a summary. The default agents run locally without an AI account.

![KOR AI CRM running with fictional demonstration records](docs/assets/dashboard-desktop.png)

[Mobile screenshot](docs/assets/dashboard-mobile.png) · [Fictional demo and analysis](docs/DEMO.md)

## Quick start

Use **Node.js 24 or newer**:

```bash
git clone https://github.com/ufukefekaya-tr/kor-ai-crm.git
cd kor-ai-crm
npm ci
cp .env.example .env
npm run build
npm start
```

Open `http://127.0.0.1:4320`. The first run creates an empty local database. To try
fictional sample records, set `CRM_DEMO=true` in `.env` **before the first start**.
Demo seeding only occurs when all collections are empty. For frontend development,
use `npm run dev` (UI port 5176, API port 4320).

The default listener is local to your computer. Optional `CRM_API_TOKEN` protects
API access and is required for a non-loopback listener. This is a personal/local
workspace, not a multi-tenant identity or access-control system. Review SECURITY.md
before deploying beyond your own computer. Runtime data and `.env` stay outside
source control; back up your local data directory yourself.

## Workflow and features

- Customer and representative records with explicit IDs and validated references.
- Visit recording with outcomes, actions, next steps, optional coordinates and
  amounts; exact duplicate visits are rejected without discarding similar notes.
- Appointments, ordered route stops and visit/sales targets.
- Dashboard summaries, chart data and live refresh through local server events.
- Explainable quality signals for short/vague notes, repeated narratives, visit
  frequency and location inconsistencies; configurable general thresholds.
- Customer follow-up indicators based on recorded activity, with limitations
  exposed alongside the analysis. These are review aids, not findings of employee
  dishonesty, fraud or performance determinations.
- Read-only analyst, planner and coach chat. Deterministic local demonstrations
  are labelled as mock responses; they cannot change CRM records or execute tools.
- A reviewed legacy skill catalog with exact inclusion/exclusion status. Two
  local arithmetic/time utilities are available as a developer library; catalog
  entries are never automatically executed. See [skill review](docs/SKILLS.md).

Routes are ordered customer lists, not road-network route optimization or live
tracking. GPS is optional user-entered data; no external map service or background
location collection is used. Connector records are configuration metadata only;
this distribution does not send mail, webhooks or notifications.

## Optional AI

The CRM works without external AI. To enable Gemini chat, explicitly set
`CRM_AI_ENABLED=true`, `CRM_AI_MODEL` and your own `GEMINI_API_KEY` in `.env`.
The entered message and a bounded CRM summary are sent to the selected provider.
Review data-sharing permissions and provider terms first. No provider calls are
made by the automated tests or the demo screenshots. No credentials are sent to
or stored by the browser UI.

See the [reproducible fictional records and analysis](docs/DEMO.md).

## Source extraction

This is a clean standalone extraction of owned KOR-AI / AgentsHUB CRM concepts,
schema and reusable analysis rules, with a newly reconstructed interface and
portable persistence. It is not a copy of the live installation. Legacy autonomous
agents, desktop automation, external chat integrations, remote skill installers,
credential stores and third-party agent runtimes are excluded. See
[provenance and migration details](docs/EXTRACTION.md).

Production databases, customer/contact lists, visit trails, messages, prompts,
agent memory, reports, API credentials, deployment settings and historical Git
objects are excluded. All demo records and screenshots are newly generated
fictional examples.

## Development

```bash
npm run check
npm test
npm run build
```

Tests use temporary databases, fictional inputs and mocked providers. Dependency
licenses are retained in THIRD_PARTY_LICENSES.txt; regenerate with
`npm run licenses` after dependency changes.

## License

Copyright **2026 Ufuk Efe Kaya**. Original owned source, reconstructed interface,
fictional examples, documentation and screenshots are licensed under
**MIT OR Apache-2.0**, at your option. See LICENSE, LICENSE-MIT, LICENSE-APACHE
and NOTICE. Third-party libraries retain their own terms.
