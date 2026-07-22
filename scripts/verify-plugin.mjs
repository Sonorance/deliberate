#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyPlugin(pluginRoot, { selfContained = false } = {}) {
  const root = resolve(pluginRoot);
  const manifestPath = join(root, 'plugin.json');
  assert.ok(existsSync(manifestPath), 'plugin is missing plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, 'deliberate');
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.deepEqual(manifest.skills, ['skills/']);

  for (const required of [
    join('skills', 'deliberate', 'SKILL.md'),
    join('skills', 'deliberate', 'scripts', 'deliberate.mjs'),
  ]) assert.ok(existsSync(join(root, required)), `plugin is missing ${required}`);

  const skill = readFileSync(join(root, 'skills', 'deliberate', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: deliberate\n[\s\S]*?\n---/);
  assert.match(skill, /<skill-base-directory>\/scripts\/deliberate\.mjs/);

  if (selfContained) {
    for (const required of [
      'runtime/package.json',
      'runtime/src/cli/deliberate.mjs',
      'runtime/roles/config.yaml',
      'runtime/node_modules/sonorance/package.json',
    ]) assert.ok(existsSync(join(root, required)), `self-contained plugin is missing ${required}`);
    const runtimePackage = JSON.parse(readFileSync(join(root, 'runtime', 'package.json'), 'utf8'));
    assert.equal(runtimePackage.version, manifest.version, 'plugin and bundled runtime versions differ');
  }

  const forbidden = /^(?:test|\.github|\.env(?:\.|$)|node_modules$)/;
  if (basename(root) === 'deliberate-plugin') {
    for (const entry of readdirSync(root)) {
      assert.doesNotMatch(entry, forbidden, `plugin artifact includes forbidden root entry ${entry}`);
    }
  }
  const inspect = (directory, relative = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = relative ? join(relative, entry.name) : entry.name;
      assert.notEqual(entry.name, '.DS_Store', `plugin includes local metadata at ${path}`);
      assert.ok(!entry.name.startsWith('.env'), `plugin includes environment configuration at ${path}`);
      assert.notEqual(path, join('skills', 'deliberate', 'scripts', 'engine.json'), 'plugin includes a machine-specific engine config');
      if (entry.isDirectory()) inspect(join(directory, entry.name), path);
    }
  };
  if (selfContained || basename(root) === 'deliberate-plugin') inspect(root);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || '.';
  const manifest = verifyPlugin(target, { selfContained: process.argv.includes('--self-contained') });
  process.stdout.write(`Verified Deliberate plugin ${manifest.version} at ${resolve(target)}.\n`);
}
