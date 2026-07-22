#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const tarball = process.argv[2];
assert.ok(tarball, 'usage: node scripts/verify-tarball.mjs <package.tgz>');

const paths = new Set(execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((path) => path.startsWith('package/') && !path.endsWith('/'))
  .map((path) => path.slice('package/'.length)));
for (const required of [
  'AGENTS.md',
  'LICENSE',
  'README.md',
  'roles/skills/README.md',
  'roles/skills/prioritization.md',
  'roles/skills/win-conditions.md',
  'src/cli/deliberate.mjs',
  'src/engine/commands.mjs',
]) assert.ok(paths.has(required), `npm package is missing ${required}`);

for (const path of paths) {
  assert.doesNotMatch(path, /^(?:skills?\/|plugin\.json$|test\/|test-setup\.mjs|spec\/|\.github\/)/, `runtime-only npm package includes ${path}`);
}

process.stdout.write(`Verified immutable release tarball with ${paths.size} files.\n`);
