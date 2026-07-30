#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePluginManifests } from './plugin-manifests.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const version = process.argv[2] || packageVersion;

const updates = {
  'plugin.json': (data) => {
    data.version = version;
  },
  'skills/deliberate/runtime.json': (data) => {
    data.version = version;
  },
};

for (const [path, update] of Object.entries(updates)) {
  const fullPath = join(root, path);
  const data = JSON.parse(readFileSync(fullPath, 'utf8'));
  update(data);
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

const skillPath = join(root, 'skills', 'deliberate', 'SKILL.md');
const skill = readFileSync(skillPath, 'utf8');
if (/^  version:\s*['"]?[^'"\n]+['"]?\s*$/m.test(skill)) {
  writeFileSync(skillPath, skill.replace(/^  version:\s*['"]?[^'"\n]+['"]?\s*$/m, `  version: '${version}'`));
}

generatePluginManifests(root);
