import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const collect = async (root) => {
  const files = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const path = join(root, item.name);
    if (item.isDirectory()) files.push(...await collect(path));
    else if (item.name.endsWith('.js')) files.push(path);
  }
  return files;
};
for (const file of [...await collect('server'), ...await collect('scripts'), ...await collect('skills')]) {
  const checked = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (checked.status !== 0) process.exit(checked.status ?? 1);
}
console.log('Server and script syntax checks passed.');
