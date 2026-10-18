# Release validation · 0.1.0

Validated on Node.js 24 with temporary databases and fictional inputs.

- **47 tests passed, zero failed or skipped**: 23 analysis tests, 15 API tests,
  four local-skill tests and five frontend form-serialization tests.
- Syntax checks and the production React build passed.
- Analysis regressions cover neutral evidence scoring, negation, duplicate notes,
  valid/missing GPS, real calendar dates, explicit reference time, full history,
  future records, configuration overrides and batch/standalone equivalence.
- API regressions cover CRUD, reference integrity, exact duplicate rejection,
  persistence and non-reseeding, query/body limits, Host/origin/auth controls,
  SSE metadata, deterministic mock agents and injected provider mocks.
- Form tests cover clearing optional fields with full replacement, zero-valued
  coordinates/amounts, timezone round trips, route order and new-record creation.
- A 1,000-visit regression checks complete history and cached pagination/summary
  reuse after writes. A separate synthetic HTTP benchmark returned all 5,000
  visits across ten 500-row pages: initial summary about 1.4 seconds, all pages
  about 1.0 second total on the validation server. Timings depend on the machine;
  these are observations, not latency guarantees.
- Newly exported fictional records, analysis and summary use a fixed reference
  time; their SHA-256 fingerprints match `examples/manifest.json`.
- Browser checks passed against the final backend: representative/customer creation,
  zero coordinates, clearing fields, visits with expanded reasons, appointments,
  ordered routes, targets, connector metadata, mock chat and all 32 catalog entries.
  All ten pages fit a 390px mobile viewport. A protected empty workspace, token
  headers/SSE, browser-storage isolation and token clearing on refresh were checked.
  No browser runtime errors or live provider calls were observed.
- Three final screenshots were captured from the restored fictional workspace and
  visually inspected on desktop and mobile.
- Dependency installation audit reported zero known vulnerabilities at release.

No automated check or screenshot uses a live AI provider, customer database,
message account, production integration, background notification or live GPS.
See EXTRACTION.md and SKILLS.md for the exact included and excluded capabilities.
