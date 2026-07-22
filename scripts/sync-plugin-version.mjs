#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const version = process.argv[2] || packageVersion;

for (const path of ['plugin.json', '.github/plugin/marketplace.json']) {
  const fullPath = join(root, path);
  const data = JSON.parse(readFileSync(fullPath, 'utf8'));
  if (path === 'plugin.json') data.version = version;
  else {
    data.metadata.version = version;
    for (const plugin of data.plugins) plugin.version = version;
  }
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}
