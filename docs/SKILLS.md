# Skill extraction review

All 32 legacy marketplace modules were inventoried. This catalog is a provenance
and capability review, not a list of enabled agent tools. The CRM never imports
or executes a catalog entry. No OpenClaw, ClawHub or other third-party runtime is
vended. Original file names and SHA-256 fingerprints identify the reviewed
versions without revealing local deployment paths or credentials.

`skills/local.js` provides two explicitly callable local utilities for developers:
`calculate(expression)` and `getTime(timezone, now)`. They do not access the
network, shell, clipboard, databases or filesystem. The arithmetic parser rejects
code, limits input/tokens/nesting, and rejects non-finite results. These utilities
are not automatically executed by chat. CRM visit recording and analysis use the
validated application API and `server/analysis.js`.

The remaining modules depend on production paths, account permissions, outbound
services, arbitrary code or host automation. Their executable source is excluded
from this extraction; no placeholder claims to implement them. Add any future
adapter deliberately, with scoped access, tests and explicit operator configuration.

| Skill | Public status | Review outcome |
| --- | --- | --- |
| `auto_capture` | excluded | Desktop capture and operating-system automation require an explicitly reviewed host adapter. |
| `brave_search` | excluded | External search provider requires credentials and explicit data-sharing controls. |
| `browser_agent` | excluded | Browser automation requires a separate isolated browser and permission model. |
| `byterover` | excluded | External memory persistence and credential integration are outside the standalone CRM. |
| `calculator` | local-library | Reimplemented as a bounded arithmetic parser without dynamic code evaluation. |
| `clawhub_installer` | excluded | Remote package installation and shell execution are excluded. |
| `clawhub_remote` | excluded | Remote skill discovery/execution is excluded; no third-party runtime is bundled. |
| `clipboard` | excluded | Host clipboard access is excluded from the web CRM. |
| `duckduckgo_search` | excluded | External web scraping/search requires a reviewed outbound adapter. |
| `email_manager` | excluded | Mailbox access and sending require explicit account permissions and a separate adapter. |
| `excel_manager` | excluded | Arbitrary filesystem/spreadsheet operations require a scoped document adapter. |
| `get_time` | local-library | Reimplemented as a local timezone-aware utility with an injectable clock. |
| `github_manager` | excluded | Remote repository writes and shell credentials require a separate authenticated adapter. |
| `google_search` | excluded | External search requires an explicit outbound adapter. |
| `google_workspace` | excluded | Workspace account permissions and writes require a separate authenticated adapter. |
| `health_checker` | excluded | Host service/network probes are outside the customer CRM data model. |
| `image_generator` | excluded | Image generation requires an optional provider and explicit usage configuration. |
| `mcp_bridge` | excluded | Original JSON-RPC POST helper is not a complete MCP client; excluded rather than claiming MCP compatibility. |
| `pdf_extractor` | excluded | PDF parsing requires a separately bounded document-ingestion adapter. |
| `pdf_reader` | excluded | PDF and arbitrary-path ingestion are excluded from the standalone CRM. |
| `python_runner` | excluded | Arbitrary Python/shell execution is excluded. |
| `screenshot` | excluded | Desktop/browser capture requires a separate isolated host adapter. |
| `signal_agent` | excluded | Cross-agent signaling and legacy runtime paths are excluded. |
| `skill_creator` | excluded | Self-modifying skills and dynamic execution are excluded. |
| `system_monitor` | excluded | Host process/network introspection is outside the CRM. |
| `tavily_search` | excluded | External search provider requires credentials and explicit data-sharing controls. |
| `url_opener` | excluded | Opening arbitrary local/browser targets is excluded. |
| `visit_analyzer` | replaced-by-crm | General visit-quality concepts are implemented by server/analysis.js; legacy live database/provider bindings are excluded. |
| `visit_logger` | replaced-by-crm | Visit persistence, exact customer IDs and deduplication are implemented by the CRM API; legacy chat/notification side effects are excluded. |
| `weather` | excluded | Weather requests and external location disclosure require an explicit outbound adapter. |
| `web_scraper` | excluded | Arbitrary outbound URL fetching requires a reviewed network boundary. |
| `write_file` | excluded | Arbitrary filesystem writes are excluded; CRM persistence is scoped to its own data directory. |
