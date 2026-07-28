#!/usr/bin/env node
/**
 * Stable launcher for standalone skills, source checkouts, and bundled plugins.
 *
 * Resolution order:
 *   1. DELIBERATE_ENGINE
 *   2. enclosing runtime/src/cli/deliberate.mjs
 *   3. enclosing src/cli/deliberate.mjs with installed dependencies
 *   4. exact package and version from ../runtime.json
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REQUIRED_PACKAGE = 'deliberate-cli';
const MINIMUM_NODE = '22.5.0';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const canonicalPath = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const unique = (paths) => [...new Set(paths)];
const compareVersions = (left, right) => {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

const runtimeError = (detail) => new Error(
  `Invalid Deliberate runtime metadata: ${detail}. Reinstall or update the Deliberate skill.`,
);

const readRuntimeMetadata = (skillDirs, nodeVersion) => {
  const path = skillDirs.map((skillDir) => join(skillDir, 'runtime.json')).find(existsSync);
  if (!path) {
    throw runtimeError(`runtime.json is missing from ${skillDirs[0]}`);
  }

  let metadata;
  try {
    metadata = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw runtimeError(`${path} is not valid JSON`);
  }
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
    throw runtimeError(`${path} must contain a JSON object`);
  }
  if (metadata.package !== REQUIRED_PACKAGE) {
    throw runtimeError(`${path} must name package "${REQUIRED_PACKAGE}"`);
  }
  if (typeof metadata.version !== 'string' || !SEMVER.test(metadata.version)) {
    throw runtimeError(`${path} must contain an exact semantic version`);
  }
  const nodeMatch = typeof metadata.node === 'string' && metadata.node.match(/^>=(\d+\.\d+\.\d+)$/);
  if (!nodeMatch || !SEMVER.test(nodeMatch[1]) || compareVersions(nodeMatch[1], MINIMUM_NODE) < 0) {
    throw runtimeError(`${path} must require Node.js ${MINIMUM_NODE} or newer`);
  }
  const currentNode = nodeVersion.match(/^(\d+\.\d+\.\d+)/)?.[1];
  if (!currentNode || compareVersions(currentNode, nodeMatch[1]) < 0) {
    throw new Error(`Deliberate requires Node.js ${nodeMatch[1]} or newer; current version is ${nodeVersion}.`);
  }
  return { ...metadata, path };
};

export function resolveLaunchTarget({
  baseDir = here,
  env = process.env,
  platform = process.platform,
  nodeVersion = process.versions.node,
} = {}) {
  if (env.DELIBERATE_ENGINE && isFile(env.DELIBERATE_ENGINE)) {
    return { command: process.execPath, args: [canonicalPath(env.DELIBERATE_ENGINE)], source: 'DELIBERATE_ENGINE' };
  }

  const lexicalSkillDir = resolve(baseDir, '..');
  const skillDirs = unique([lexicalSkillDir, canonicalPath(lexicalSkillDir)]);
  const roots = unique(skillDirs.map((skillDir) => resolve(skillDir, '..', '..')));

  for (const root of roots) {
    const bundledEngine = join(root, 'runtime', 'src', 'cli', 'deliberate.mjs');
    if (isFile(bundledEngine)) {
      return { command: process.execPath, args: [bundledEngine], source: 'bundled runtime' };
    }
  }

  for (const root of roots) {
    const sourceEngine = join(root, 'src', 'cli', 'deliberate.mjs');
    const sourceDependency = join(root, 'node_modules', 'sonorance', 'package.json');
    if (isFile(sourceEngine) && isFile(sourceDependency)) {
      return { command: process.execPath, args: [sourceEngine], source: 'source checkout' };
    }
  }

  const metadata = readRuntimeMetadata(skillDirs, nodeVersion);
  return {
    command: platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['--yes', `${metadata.package}@${metadata.version}`],
    source: 'skill runtime metadata',
  };
}

function main() {
  let target;
  try {
    target = resolveLaunchTarget({ baseDir: dirname(resolve(process.argv[1])) });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const result = spawnSync(target.command, [...target.args, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  if (result.error) console.error(`Could not start Deliberate through ${target.source}: ${result.error.message}`);
  process.exit(result.status ?? 1);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
