#!/usr/bin/env node
/**
 * deliberate.mjs — launcher the skill shells into. Resolves the Deliberate engine
 * and forwards all args + stdio to it, so the SKILL.md never hard-codes an engine
 * path. Resolution order:
 *   1. $DELIBERATE_ENGINE (explicit override)
 *   2. ./engine.json  { "engine": "/abs/path/to/src/cli/deliberate.mjs" }  (written by `deliberate install`)
 *   3. ../../src/cli/deliberate.mjs  (in-repo dev: skill/scripts → repo root)
 * The spawned engine inherits cwd, so `init`/`case` act on the folder the user is in.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function enginePath() {
  const env = process.env.DELIBERATE_ENGINE;
  if (env && existsSync(env)) return env;
  const cfg = join(here, 'engine.json');
  if (existsSync(cfg)) { try { const e = JSON.parse(readFileSync(cfg, 'utf8')).engine; if (e && existsSync(e)) return e; } catch { /* ignore */ } }
  return resolve(here, '../../src/cli/deliberate.mjs');
}

function launchTarget() {
  const engine = enginePath();
  if (existsSync(engine)) return { command: process.execPath, args: [engine] };
  const cfg = join(here, 'engine.json');
  if (existsSync(cfg)) {
    try {
      const { package: name, version } = JSON.parse(readFileSync(cfg, 'utf8'));
      if (name === 'deliberate-cli' && version) {
        return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['-y', `${name}@${version}`] };
      }
    } catch { /* handled by the error below */ }
  }
  console.error(`deliberate: engine not found at ${engine}. Set DELIBERATE_ENGINE or re-run \`npx deliberate-cli install\`.`);
  process.exit(1);
}

const target = launchTarget();
const r = spawnSync(target.command, [...target.args, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
