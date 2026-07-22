import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLaunchTarget } from '../skills/deliberate/scripts/deliberate.mjs';
import { verifyPlugin } from '../scripts/verify-plugin.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('repository is a version-aligned Git-installable Copilot plugin', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const plugin = verifyPlugin(repoRoot);
  const marketplace = JSON.parse(readFileSync(join(repoRoot, '.github/plugin/marketplace.json'), 'utf8'));
  assert.equal(plugin.version, pkg.version);
  assert.deepEqual(plugin.skills, ['skills/']);
  assert.equal(marketplace.metadata.version, pkg.version);
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, plugin.name);
  assert.equal(marketplace.plugins[0].version, pkg.version);
  assert.equal(marketplace.plugins[0].source, '.');
});

test('plugin launcher prefers a bundled runtime', () => {
  const root = mkdtempSync(join(tmpdir(), 'dlb-plugin-runtime-'));
  try {
    const baseDir = join(root, 'skills', 'deliberate', 'scripts');
    const engine = join(root, 'runtime', 'src', 'cli', 'deliberate.mjs');
    mkdirSync(dirname(engine), { recursive: true });
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(engine, '');
    writeFileSync(join(root, 'plugin.json'), '{"name":"deliberate","version":"1.2.3"}\n');
    const target = resolveLaunchTarget({ baseDir, env: {} });
    assert.equal(target.command, process.execPath);
    assert.deepEqual(target.args, [engine]);
    assert.equal(target.source, 'plugin runtime');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('thin plugin launcher falls back to its pinned npm runtime', () => {
  const root = mkdtempSync(join(tmpdir(), 'dlb-plugin-thin-'));
  try {
    const baseDir = join(root, 'skills', 'deliberate', 'scripts');
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(join(root, 'plugin.json'), '{"name":"deliberate","version":"1.2.3"}\n');
    const target = resolveLaunchTarget({ baseDir, env: {} });
    assert.deepEqual(target.args, ['--yes', 'deliberate-cli@1.2.3']);
    assert.equal(target.source, 'plugin package');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('thin plugin ignores removed standalone engine configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'dlb-plugin-no-legacy-install-'));
  try {
    const baseDir = join(root, 'skills', 'deliberate', 'scripts');
    const legacyEngine = join(root, 'legacy-engine.mjs');
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(legacyEngine, '');
    writeFileSync(join(baseDir, 'engine.json'), JSON.stringify({ engine: legacyEngine }));
    writeFileSync(join(root, 'plugin.json'), '{"name":"deliberate","version":"1.2.3"}\n');
    const target = resolveLaunchTarget({ baseDir, env: {} });
    assert.deepEqual(target.args, ['--yes', 'deliberate-cli@1.2.3']);
    assert.equal(target.source, 'plugin package');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
