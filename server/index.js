// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
import { createApp } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const app = createApp(config);
const server = app.listen(config.port, config.host, () => console.log(`KOR AI CRM listening at http://${config.host}:${config.port}; demo=${config.demo}; AI=${config.aiEnabled ? 'explicit Gemini opt-in' : 'mock'}`));
server.on('error', error => { console.error(`CRM listener failed: ${error.code || 'STARTUP_ERROR'}`); app.locals.close(); process.exitCode = 1; });
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!stopping) { stopping = true; app.locals.close(); server.close(); } });
