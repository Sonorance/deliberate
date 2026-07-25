#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const HOMEPAGE = 'https://trydeliberate.com';
const REPOSITORY = 'https://github.com/Sonorance/deliberate';
const MANIFEST_PATHS = [
  'plugin.json',
  '.github/plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
  'gemini-extension.json',
  '.cursor-plugin/plugin.json',
  'skills/deliberate/runtime.json',
];

const readJson = (root, path) => {
  const fullPath = join(root, path);
  assert.ok(existsSync(fullPath), `distribution is missing ${path}`);
  try {
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch (error) {
    assert.fail(`${path} is not valid JSON: ${error.message}`);
  }
};

const assertIdentity = (manifest, version, path) => {
  assert.equal(manifest.name, 'deliberate', `${path} has the wrong name`);
  assert.equal(manifest.version, version, `${path} version differs from package.json`);
  assert.equal(typeof manifest.description, 'string', `${path} is missing its description`);
};

const assertSinglePlugin = (marketplace, version, path, source, { topLevelVersion = true } = {}) => {
  assert.equal(marketplace.name, 'deliberate', `${path} has the wrong marketplace name`);
  if (topLevelVersion) assert.equal(marketplace.version ?? marketplace.metadata?.version, version, `${path} version differs from package.json`);
  assert.equal(marketplace.plugins?.length, 1, `${path} must expose exactly one plugin`);
  assert.equal(marketplace.plugins[0].name, 'deliberate', `${path} exposes the wrong plugin`);
  assert.equal(marketplace.plugins[0].version, version, `${path} plugin version differs from package.json`);
  assert.deepEqual(marketplace.plugins[0].source, source, `${path} does not resolve the repository root`);
};

const inspectArtifact = (root) => {
  const expectedRoot = new Set([
    '.agents',
    '.claude-plugin',
    '.codex-plugin',
    '.cursor-plugin',
    '.github',
    'LICENSE',
    'README.md',
    'gemini-extension.json',
    'plugin.json',
    'runtime',
    'skills',
  ]);
  assert.deepEqual(new Set(readdirSync(root)), expectedRoot, 'distribution root contains missing or unexpected entries');

  const inspect = (directory, relative = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = relative ? join(relative, entry.name) : entry.name;
      const normalized = path.split(sep).join('/');
      const dependency = normalized.startsWith('runtime/node_modules/');
      assert.notEqual(entry.name, '.DS_Store', `distribution includes local metadata at ${path}`);
      assert.ok(!entry.name.startsWith('.env'), `distribution includes environment configuration at ${path}`);
      assert.notEqual(entry.name, 'engine.json', `distribution includes removed engine configuration at ${path}`);
      assert.ok(!normalized.split('/').some((segment) => segment === '.git'), `distribution includes repository material at ${path}`);
      assert.ok(dependency || !normalized.split('/').some((segment) => segment === 'internal'), `distribution includes private material at ${path}`);
      assert.ok(dependency || !normalized.split('/').some((segment) => /^(?:tests?|specs?)$/.test(segment)), `distribution includes test material at ${path}`);
      if (entry.isDirectory()) inspect(join(directory, entry.name), path);
      else if (!dependency && statSync(join(directory, entry.name)).size < 1_000_000) {
        const content = readFileSync(join(directory, entry.name), 'utf8');
        assert.doesNotMatch(content, /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\)/, `distribution includes a machine path in ${path}`);
      }
    }
  };
  inspect(root);
};

export function verifyPlugin(pluginRoot, { selfContained = false } = {}) {
  const root = resolve(pluginRoot);
  const packagePath = existsSync(join(root, 'package.json')) ? 'package.json' : 'runtime/package.json';
  const pkg = readJson(root, packagePath);
  assert.equal(pkg.name, 'deliberate-cli', `${packagePath} has the wrong package name`);
  assert.match(pkg.version, SEMVER, `${packagePath} does not contain a semantic version`);
  assert.equal(pkg.engines?.node, '>=22.5.0', `${packagePath} has the wrong Node.js floor`);

  for (const path of [...MANIFEST_PATHS, 'LICENSE', 'README.md']) {
    assert.ok(existsSync(join(root, path)), `distribution is missing ${path}`);
  }
  for (const required of [
    'skills/deliberate/SKILL.md',
    'skills/deliberate/scripts/deliberate.mjs',
  ]) assert.ok(existsSync(join(root, required)), `distribution is missing ${required}`);

  const plugin = readJson(root, 'plugin.json');
  assertIdentity(plugin, pkg.version, 'plugin.json');
  assert.deepEqual(plugin.skills, ['skills/']);
  assert.equal(plugin.homepage, HOMEPAGE);
  assert.equal(plugin.repository, REPOSITORY);

  const copilotMarketplace = readJson(root, '.github/plugin/marketplace.json');
  assertSinglePlugin(copilotMarketplace, pkg.version, '.github/plugin/marketplace.json', '.');
  assert.equal(copilotMarketplace.plugins[0].homepage, HOMEPAGE);

  const claude = readJson(root, '.claude-plugin/plugin.json');
  assertIdentity(claude, pkg.version, '.claude-plugin/plugin.json');
  assert.equal(claude.skills, './skills/');
  assert.equal(claude.homepage, HOMEPAGE);
  assert.equal(claude.repository, REPOSITORY);
  assert.ok(!('hooks' in claude) && !('mcpServers' in claude), 'Claude plugin must not install hooks or MCP servers');
  const claudeMarketplace = readJson(root, '.claude-plugin/marketplace.json');
  assertSinglePlugin(claudeMarketplace, pkg.version, '.claude-plugin/marketplace.json', '.');

  const codex = readJson(root, '.codex-plugin/plugin.json');
  assertIdentity(codex, pkg.version, '.codex-plugin/plugin.json');
  assert.equal(codex.skills, './skills/');
  assert.equal(codex.homepage, HOMEPAGE);
  assert.equal(codex.repository, REPOSITORY);
  assert.ok(!('hooks' in codex) && !('mcpServers' in codex) && !('apps' in codex), 'Codex plugin must contain only the canonical skill');
  const codexMarketplace = readJson(root, '.agents/plugins/marketplace.json');
  assertSinglePlugin(codexMarketplace, pkg.version, '.agents/plugins/marketplace.json', { source: 'local', path: './' }, { topLevelVersion: false });
  assert.equal(codexMarketplace.plugins[0].policy?.installation, 'AVAILABLE');
  assert.equal(codexMarketplace.plugins[0].policy?.authentication, 'ON_INSTALL');
  assert.equal(codexMarketplace.plugins[0].category, 'Productivity');

  const gemini = readJson(root, 'gemini-extension.json');
  assertIdentity(gemini, pkg.version, 'gemini-extension.json');
  assert.deepEqual(Object.keys(gemini).sort(), ['description', 'name', 'version'], 'Gemini extension must contain only identity metadata');

  const cursor = readJson(root, '.cursor-plugin/plugin.json');
  assertIdentity(cursor, pkg.version, '.cursor-plugin/plugin.json');
  assert.equal(cursor.author?.name, 'Sonorance');
  assert.equal(cursor.homepage, HOMEPAGE);
  assert.equal(cursor.repository, REPOSITORY);
  assert.ok(!('skills' in cursor), 'Cursor must use default skills/ discovery');
  assert.ok(!('hooks' in cursor) && !('mcpServers' in cursor), 'Cursor plugin must not install hooks or MCP servers');

  const runtime = readJson(root, 'skills/deliberate/runtime.json');
  assert.equal(runtime.package, pkg.name, 'runtime.json has the wrong package');
  assert.equal(runtime.version, pkg.version, 'runtime.json version differs from package.json');
  assert.equal(runtime.node, pkg.engines.node, 'runtime.json Node.js floor differs from package.json');

  const skill = readFileSync(join(root, 'skills', 'deliberate', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: deliberate\n[\s\S]*?\n---/);
  assert.match(skill, /<skill-base-directory>\/scripts\/deliberate\.mjs/);
  assert.equal(skill.match(/^version:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1], pkg.version, 'SKILL.md version differs from package.json');

  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /runtime requires Node\.js 22\.5 or newer/);
  assert.match(readme, /skills` CLI requires Node\.js 22\.20 or newer/);
  assert.match(readme, /Copilot CLI only; it does not enable Deliberate in the Copilot app or cloud agent/);
  assert.match(readme, /exactly one asset: the universal self-contained `deliberate-v<version>\.tar\.gz`/);
  assert.match(readme, /`deliberate-plugin-v<version>\.tgz`[\s\S]*GitHub Actions workflow artifact/);
  assert.match(readme, /\/plugin marketplace update deliberate/);
  assert.match(readme, /codex plugin marketplace upgrade deliberate` refreshes only the marketplace catalog/);

  const workflowPath = join(root, '.github', 'workflows', 'release.yml');
  if (existsSync(workflowPath)) {
    const workflow = readFileSync(workflowPath, 'utf8');
    const releaseJob = workflow.slice(workflow.indexOf('\n  github-release:'));
    assert.ok(releaseJob.startsWith('\n  github-release:'), 'release workflow is missing its GitHub release job');
    assert.ok(workflow.includes('${{ steps.plugin.outputs.tarball }}'), 'release workflow must retain the compatibility tgz as a workflow artifact');
    assert.ok(releaseJob.includes('asset="${{ needs.build.outputs.universal_tarball }}"'), 'GitHub release must upload the universal tar.gz');
    assert.ok(!releaseJob.includes('needs.build.outputs.plugin_tarball'), 'GitHub release must not upload the compatibility tgz');
    assert.ok(releaseJob.includes('unexpected='), 'GitHub release resume must reject extra assets');
    assert.ok(releaseJob.includes('final_assets='), 'GitHub release must verify its sole final asset');
  }

  if (selfContained) {
    for (const required of [
      'runtime/src/cli/deliberate.mjs',
      'runtime/roles/config.yaml',
      'runtime/node_modules/sonorance/package.json',
    ]) assert.ok(existsSync(join(root, required)), `self-contained distribution is missing ${required}`);
    const runtimePackage = readJson(root, 'runtime/package.json');
    assert.equal(runtimePackage.version, runtime.version, 'skill and bundled runtime versions differ');
    assert.equal(runtimePackage.engines?.node, runtime.node, 'skill and bundled runtime Node.js floors differ');
    inspectArtifact(root);
  }

  return plugin;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || '.';
  const manifest = verifyPlugin(target, { selfContained: process.argv.includes('--self-contained') });
  process.stdout.write(`Verified Deliberate distribution ${manifest.version} at ${resolve(target)}.\n`);
}
