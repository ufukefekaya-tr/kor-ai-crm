import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Preserve installed dependency notices without bundling dependency source.
// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
const packages = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith('@')) { await collect(path); continue; }
    try {
      const info = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
      const licenses = [];
      for (const name of await readdir(path)) {
        if (/^licen[cs]e(?:[.-].*)?$/i.test(name)) {
          try { licenses.push(await readFile(join(path, name), 'utf8')); } catch {}
        }
      }
      packages.push({ name: info.name, version: info.version, license: info.license ?? 'see upstream', licenses });
      try { await collect(join(path, 'node_modules')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
await collect('node_modules');
packages.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const seen = new Set();
let output = 'KOR AI CRM third-party dependency notices\n\nGenerated from the lockfile installation. These dependencies retain their own\nlicenses; original KOR AI CRM licensing does not relicense them. Build/test tools are\nlisted as well as runtime libraries. Dependencies with no root license file\nlisted here retain their upstream distribution notices and terms.\n\n';
for (const p of packages) {
  const id = `${p.name}@${p.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  output += `\n${'='.repeat(72)}\n${id}\nDeclared license: ${typeof p.license === 'string' ? p.license : JSON.stringify(p.license)}\n\n`;
  output += p.licenses.length ? p.licenses.join('\n\n') : '(No root license text file in the installed package; see upstream.)';
  output += '\n';
}
await writeFile('THIRD_PARTY_LICENSES.txt', output);
console.log(`Preserved ${seen.size} dependency notices.`);
