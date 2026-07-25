#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const archive = process.argv[2];
assert.ok(archive, 'usage: node scripts/verify-distribution-archive.mjs <distribution.tar.gz>');

const members = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);
const normalizedMembers = new Map(members.map((member) => [member.replace(/^\.\//, '').replace(/\/$/, ''), member]));
const prefix = normalizedMembers.has('gemini-extension.json')
  ? ''
  : normalizedMembers.has('deliberate-plugin/gemini-extension.json') ? 'deliberate-plugin/' : null;
assert.notEqual(prefix, null, 'distribution archive does not contain gemini-extension.json at a supported root');

const required = [
  'plugin.json',
  '.github/plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
  'gemini-extension.json',
  '.cursor-plugin/plugin.json',
  'skills/deliberate/SKILL.md',
  'skills/deliberate/runtime.json',
  'skills/deliberate/scripts/deliberate.mjs',
  'runtime/package.json',
  'runtime/src/cli/deliberate.mjs',
  'runtime/roles/config.yaml',
  'LICENSE',
  'README.md',
];
for (const path of required) {
  assert.ok(normalizedMembers.has(`${prefix}${path}`), `distribution archive is missing ${path}`);
}

for (const path of normalizedMembers.keys()) {
  const relative = path.slice(prefix.length);
  const dependency = relative.startsWith('runtime/node_modules/');
  assert.ok(!relative.split('/').some((segment) => segment === 'internal' || segment === '.git'), `distribution archive includes private or repository material at ${relative}`);
  assert.ok(dependency || !relative.split('/').some((segment) => /^(?:tests?|specs?)$/.test(segment)), `distribution archive includes test material at ${relative}`);
  assert.ok(!relative.split('/').some((segment) => segment === 'engine.json' || segment.startsWith('.env')), `distribution archive includes local runtime configuration at ${relative}`);
}

const readText = (path) => {
  const member = normalizedMembers.get(`${prefix}${path}`);
  return execFileSync('tar', ['-xOzf', archive, member], { encoding: 'utf8' });
};
const readJson = (path) => JSON.parse(readText(path));
const plugin = readJson('plugin.json');
const copilotMarketplace = readJson('.github/plugin/marketplace.json');
const claude = readJson('.claude-plugin/plugin.json');
const claudeMarketplace = readJson('.claude-plugin/marketplace.json');
const codex = readJson('.codex-plugin/plugin.json');
const codexMarketplace = readJson('.agents/plugins/marketplace.json');
const gemini = readJson('gemini-extension.json');
const cursor = readJson('.cursor-plugin/plugin.json');
const contract = readJson('skills/deliberate/runtime.json');
const runtime = readJson('runtime/package.json');
assert.equal(plugin.name, 'deliberate');
assert.equal(gemini.name, plugin.name);
assert.equal(contract.package, 'deliberate-cli');
assert.equal(runtime.name, contract.package);
for (const [path, version] of [
  ['.github/plugin/marketplace.json metadata', copilotMarketplace.metadata?.version],
  ['.github/plugin/marketplace.json plugin', copilotMarketplace.plugins?.[0]?.version],
  ['.claude-plugin/plugin.json', claude.version],
  ['.claude-plugin/marketplace.json', claudeMarketplace.version],
  ['.claude-plugin/marketplace.json plugin', claudeMarketplace.plugins?.[0]?.version],
  ['.codex-plugin/plugin.json', codex.version],
  ['.agents/plugins/marketplace.json plugin', codexMarketplace.plugins?.[0]?.version],
  ['gemini-extension.json', gemini.version],
  ['.cursor-plugin/plugin.json', cursor.version],
  ['skills/deliberate/runtime.json', contract.version],
  ['runtime/package.json', runtime.version],
]) assert.equal(version, plugin.version, `${path} version differs from plugin.json`);
assert.equal(readText('skills/deliberate/SKILL.md').match(/^version:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1], plugin.version, 'SKILL.md version differs from plugin.json');
assert.equal(contract.node, runtime.engines?.node);

if (archive.endsWith('.tar.gz')) {
  assert.equal(prefix, '', 'Gemini-compatible .tar.gz must place its manifest at the archive root');
}

process.stdout.write(`Verified immutable Deliberate distribution archive ${archive}.\n`);
