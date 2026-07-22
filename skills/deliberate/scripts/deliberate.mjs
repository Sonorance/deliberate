#!/usr/bin/env node
/**
 * Stable plugin launcher for source, thin-plugin, and bundled-plugin installs.
 *
 * Resolution order:
 *   1. DELIBERATE_ENGINE
 *   2. ../../runtime/src/cli/deliberate.mjs (self-contained plugin)
 *   3. ../../src/cli/deliberate.mjs (source checkout with dependencies installed)
 *   4. pinned npx package from ../../plugin.json (thin plugin)
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
};

export function resolveLaunchTarget({ baseDir = here, env = process.env } = {}) {
  if (env.DELIBERATE_ENGINE && existsSync(env.DELIBERATE_ENGINE)) {
    return { command: process.execPath, args: [env.DELIBERATE_ENGINE], source: 'DELIBERATE_ENGINE' };
  }

  const pluginRoot = resolve(baseDir, '..', '..', '..');
  const bundledEngine = join(pluginRoot, 'runtime', 'src', 'cli', 'deliberate.mjs');
  if (existsSync(bundledEngine)) {
    return { command: process.execPath, args: [bundledEngine], source: 'plugin runtime' };
  }

  const sourceEngine = join(pluginRoot, 'src', 'cli', 'deliberate.mjs');
  const sourceDependency = join(pluginRoot, 'node_modules', 'sonorance', 'package.json');
  if (existsSync(sourceEngine) && existsSync(sourceDependency)) {
    return { command: process.execPath, args: [sourceEngine], source: 'source checkout' };
  }

  const plugin = readJson(join(pluginRoot, 'plugin.json'));
  if (plugin.name === 'deliberate' && plugin.version) {
    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['--yes', `deliberate-cli@${plugin.version}`],
      source: 'plugin package',
    };
  }

  throw new Error(
    'Deliberate engine not found. Reinstall the Deliberate plugin or set DELIBERATE_ENGINE.',
  );
}

function main() {
  let target;
  try {
    target = resolveLaunchTarget();
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
