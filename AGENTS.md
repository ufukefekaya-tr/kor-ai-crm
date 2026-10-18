# Working on KOR AI CRM

Use Node.js 24 or newer. Run `npm ci`, `npm run check`, `npm test`,
then `npm run build`. Regenerate fictional examples with
`node scripts/generate-examples.js`; this only uses an in-memory demo.

Keep examples fictional and all integrations explicit. Do not commit runtime
databases, customer data, credentials, `.env`, messages or agent memory.
Preserve reference integrity, exact duplicate detection, full bounded analysis
history and explicit as-of time. Scores are explainable review aids.
Read-only agents must not execute tools or mutate CRM data. Skill metadata is
not executable code. Retain third-party notices. Original contributions
use MIT OR Apache-2.0. See docs/EXTRACTION.md for extraction scope.
