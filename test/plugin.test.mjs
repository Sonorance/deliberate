import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLaunchTarget } from '../skills/deliberate/scripts/deliberate.mjs';
import { verifyPlugin } from '../scripts/verify-plugin.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeMetadata = {
  package: 'deliberate-cli',
  version: '1.2.3',
  node: '>=22.5.0',
};

const withWorkspace = (prefix, run) => {
  const root = mkdtempSync(join(repoRoot, `.${prefix}-`));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const createSkill = (root, metadata = runtimeMetadata) => {
  const baseDir = join(root, 'skills', 'deliberate', 'scripts');
  mkdirSync(baseDir, { recursive: true });
  if (metadata !== false) {
    const content = typeof metadata === 'string' ? metadata : `${JSON.stringify(metadata)}\n`;
    writeFileSync(join(root, 'skills', 'deliberate', 'runtime.json'), content);
  }
  return baseDir;
};

const writeEngine = (path) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '');
  return path;
};

const copyUniversalFixture = (root) => {
  for (const path of [
    'plugin.json',
    '.github/plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    '.codex-plugin/plugin.json',
    '.agents/plugins/marketplace.json',
    'gemini-extension.json',
    '.cursor-plugin/plugin.json',
    'skills/deliberate',
    'LICENSE',
    'README.md',
  ]) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repoRoot, path), target, { recursive: true });
  }
  for (const path of [
    ['package.json', 'runtime/package.json'],
    ['src/cli/deliberate.mjs', 'runtime/src/cli/deliberate.mjs'],
    ['roles/config.yaml', 'runtime/roles/config.yaml'],
  ]) {
    const target = join(root, path[1]);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repoRoot, path[0]), target);
  }
  const sonorancePackage = join(root, 'runtime', 'node_modules', 'sonorance', 'package.json');
  mkdirSync(dirname(sonorancePackage), { recursive: true });
  writeFileSync(sonorancePackage, '{"name":"sonorance","version":"0.4.0"}\n');
};

test('repository is a version-aligned multi-harness distribution', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const plugin = verifyPlugin(repoRoot);
  assert.equal(plugin.version, pkg.version);
  assert.deepEqual(pkg.files, ['src/engine', 'src/cli', 'roles', 'AGENTS.md', 'README.md', 'LICENSE']);
});

test('public install docs preserve harness-specific prerequisites and lifecycle contracts', () => {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
  const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');
  for (const content of [readme, agents]) {
    assert.match(content, /Node\.js 22\.5/);
    assert.match(content, /Node\.js 22\.20/);
    assert.match(content, /\.github\/copilot\/settings\.json/);
    assert.match(content, /enabledPlugins/);
    assert.match(content, /extraKnownMarketplaces/);
    assert.match(content, /\/plugin marketplace update deliberate/);
    assert.match(content, /\/plugin uninstall deliberate@deliberate/);
    assert.match(content, /codex plugin marketplace upgrade deliberate/);
  }
});

test('release publishes only the universal tar.gz while retaining the compatibility workflow artifact', () => {
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'release.yml'), 'utf8');
  const releaseJob = workflow.slice(workflow.indexOf('\n  github-release:'));
  assert.match(workflow, /\$\{\{ steps\.plugin\.outputs\.tarball \}\}/);
  assert.match(releaseJob, /asset="\$\{\{ needs\.build\.outputs\.universal_tarball \}\}"/);
  assert.doesNotMatch(releaseJob, /needs\.build\.outputs\.plugin_tarball/);
  assert.match(releaseJob, /must contain only \$asset/);
  assert.match(releaseJob, /does not contain exactly the universal release asset/);
});

test('standalone copied skill resolves its exact npm runtime without a plugin manifest', () => withWorkspace('standalone-skill', (root) => {
  const target = resolveLaunchTarget({ baseDir: createSkill(root), env: {} });
  assert.equal(target.command, process.platform === 'win32' ? 'npx.cmd' : 'npx');
  assert.deepEqual(target.args, ['--yes', 'deliberate-cli@1.2.3']);
  assert.equal(target.source, 'skill runtime metadata');
}));

test('launcher prefers DELIBERATE_ENGINE over packaged targets', () => withWorkspace('engine-env', (root) => {
  const baseDir = createSkill(root, false);
  writeEngine(join(root, 'runtime', 'src', 'cli', 'deliberate.mjs'));
  const engine = writeEngine(join(root, 'custom-engine.mjs'));
  const target = resolveLaunchTarget({ baseDir, env: { DELIBERATE_ENGINE: engine } });
  assert.deepEqual(target.args, [realpathSync(engine)]);
  assert.equal(target.source, 'DELIBERATE_ENGINE');
}));

test('launcher prefers a bundled runtime over source and npm targets', () => withWorkspace('bundled-runtime', (root) => {
  const baseDir = createSkill(root, false);
  const bundledEngine = writeEngine(join(root, 'runtime', 'src', 'cli', 'deliberate.mjs'));
  writeEngine(join(root, 'src', 'cli', 'deliberate.mjs'));
  writeEngine(join(root, 'node_modules', 'sonorance', 'package.json'));
  const target = resolveLaunchTarget({ baseDir, env: {} });
  assert.deepEqual(target.args, [bundledEngine]);
  assert.equal(target.source, 'bundled runtime');
}));

test('launcher prefers a source checkout with dependencies over npm', () => withWorkspace('source-runtime', (root) => {
  const baseDir = createSkill(root, '{');
  const sourceEngine = writeEngine(join(root, 'src', 'cli', 'deliberate.mjs'));
  writeEngine(join(root, 'node_modules', 'sonorance', 'package.json'));
  const target = resolveLaunchTarget({ baseDir, env: {} });
  assert.deepEqual(target.args, [sourceEngine]);
  assert.equal(target.source, 'source checkout');
}));

test('launcher resolves enclosing cached runtime around a symlinked canonical skill', {
  skip: process.platform === 'win32',
}, () => withWorkspace('cached-symlink', (root) => {
  const sourceRoot = join(root, 'source');
  createSkill(sourceRoot);
  const cachedSkill = join(root, 'cache', 'skills', 'deliberate');
  mkdirSync(dirname(cachedSkill), { recursive: true });
  symlinkSync(join(sourceRoot, 'skills', 'deliberate'), cachedSkill, 'dir');
  const bundledEngine = writeEngine(join(root, 'cache', 'runtime', 'src', 'cli', 'deliberate.mjs'));
  const target = resolveLaunchTarget({ baseDir: join(cachedSkill, 'scripts'), env: {} });
  assert.deepEqual(target.args, [bundledEngine]);
  assert.equal(target.source, 'bundled runtime');
}));

test('executed symlinked launcher keeps its enclosing cache layout', {
  skip: process.platform === 'win32',
}, () => withWorkspace('executed-symlink', (root) => {
  const baseDir = createSkill(root);
  const launcher = join(baseDir, 'deliberate.mjs');
  symlinkSync(join(repoRoot, 'skills', 'deliberate', 'scripts', 'deliberate.mjs'), launcher);
  writeFileSync(
    writeEngine(join(root, 'runtime', 'src', 'cli', 'deliberate.mjs')),
    'process.stdout.write(`cached:${process.argv.slice(2).join(",")}`);\n',
  );
  const result = spawnSync(process.execPath, [launcher, 'help'], {
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', SONORANCE_AUTOMATION: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'cached:help');
}));

for (const [name, metadata, error] of [
  ['missing', false, /runtime\.json is missing/],
  ['malformed', '{', /runtime\.json is not valid JSON/],
  ['wrong package', { ...runtimeMetadata, package: 'another-package' }, /must name package "deliberate-cli"/],
  ['non-semver', { ...runtimeMetadata, version: 'latest' }, /must contain an exact semantic version/],
  ['invalid Node floor', { ...runtimeMetadata, node: '>=20.0.0' }, /must require Node\.js 22\.5\.0 or newer/],
]) {
  test(`launcher rejects ${name} runtime metadata explicitly`, () => withWorkspace(`bad-runtime-${name.replaceAll(' ', '-')}`, (root) => {
    const baseDir = createSkill(root, metadata);
    assert.throws(() => resolveLaunchTarget({ baseDir, env: {} }), error);
  }));
}

test('launcher ignores removed engine.json and invalid environment overrides', () => withWorkspace('legacy-engine', (root) => {
  const baseDir = createSkill(root);
  const legacyEngine = writeEngine(join(root, 'legacy-engine.mjs'));
  writeFileSync(join(baseDir, 'engine.json'), JSON.stringify({ engine: legacyEngine }));
  const target = resolveLaunchTarget({ baseDir, env: { DELIBERATE_ENGINE: join(root, 'missing.mjs') } });
  assert.deepEqual(target.args, ['--yes', 'deliberate-cli@1.2.3']);
  assert.equal(target.source, 'skill runtime metadata');
}));

test('launcher selects the platform npx executable', () => withWorkspace('platform-npx', (root) => {
  const baseDir = createSkill(root);
  assert.equal(resolveLaunchTarget({ baseDir, env: {}, platform: 'win32' }).command, 'npx.cmd');
  assert.equal(resolveLaunchTarget({ baseDir, env: {}, platform: 'linux' }).command, 'npx');
}));

test('universal self-contained distribution verifies every adapter and runtime', () => withWorkspace('universal-distribution', (root) => {
  copyUniversalFixture(root);
  const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
  assert.equal(verifyPlugin(root, { selfContained: true }).version, version);
}));

test('universal verifier rejects version drift', () => withWorkspace('distribution-drift', (root) => {
  copyUniversalFixture(root);
  const geminiPath = join(root, 'gemini-extension.json');
  const gemini = JSON.parse(readFileSync(geminiPath, 'utf8'));
  gemini.version = '9.9.9';
  writeFileSync(geminiPath, `${JSON.stringify(gemini)}\n`);
  assert.throws(() => verifyPlugin(root, { selfContained: true }), /gemini-extension\.json version differs/);
}));
