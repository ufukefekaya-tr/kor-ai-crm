// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
import path from 'node:path';
export const LIMITS = Object.freeze({ jsonBytes: 64 * 1024, text: 4000, pageSize: 500, sseClients: 16,
  records: { customers: 2000, reps: 200, visits: 5000, appointments: 2000, targets: 1000, routes: 500, connectors: 100 } });
const integer = (value, fallback, min, max, name) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value); if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}`); return n;
};
export const isLoopbackHost = host => ['127.0.0.1', 'localhost', '::1'].includes(host);
export function loadConfig(env = process.env) {
  const port = integer(env.PORT, 4320, 1, 65535, 'PORT');
  const config = { host: env.CRM_HOST || '127.0.0.1', port, dataDir: path.resolve(env.CRM_DATA_DIR || '.data'),
    demo: env.CRM_DEMO === 'true', apiToken: env.CRM_API_TOKEN || '',
    allowedOrigins: env.CRM_ALLOWED_ORIGINS ? env.CRM_ALLOWED_ORIGINS.split(',').map(x => x.trim()).filter(Boolean) :
      [`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5176', 'http://localhost:5176'],
    rateLimit: integer(env.CRM_RATE_LIMIT, 600, 1, 10000, 'CRM_RATE_LIMIT'),
    aiEnabled: env.CRM_AI_ENABLED === 'true', aiModel: env.CRM_AI_MODEL || '', aiApiKey: env.GEMINI_API_KEY || '',
  };
  if (!isLoopbackHost(config.host) && !config.apiToken) throw new Error('A non-loopback CRM_HOST requires CRM_API_TOKEN');
  if (config.apiToken && !/^[\x21-\x7e]{16,256}$/u.test(config.apiToken)) throw new Error('CRM_API_TOKEN must contain 16–256 printable non-space ASCII characters');
  return config;
}
