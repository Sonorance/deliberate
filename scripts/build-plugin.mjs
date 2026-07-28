#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPlugin } from './verify-plugin.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(repoRoot, 'dist', 'deliberate');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const copyTracked = (paths, destination) => {
  const listed = spawnSync('git', ['ls-files', '-z', '--', ...paths], { cwd: repoRoot, encoding: 'utf8' });
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error(listed.stderr || 'could not enumerate tracked plugin files');
  for (const path of listed.stdout.split('\0').filter(Boolean)) {
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repoRoot, path), target);
  }
};
const copyFile = (path, destination) => {
  const target = join(destination, path);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(repoRoot, path), target);
};

verifyPlugin(repoRoot);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
copyTracked(['skills', 'LICENSE', 'README.md'], output);
for (const path of [
  'plugin.json',
  '.github/plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
  'gemini-extension.json',
  '.cursor-plugin/plugin.json',
  'skills/deliberate/runtime.json',
]) copyFile(path, output);

const runtime = join(output, 'runtime');
mkdirSync(runtime, { recursive: true });
copyTracked(['src', 'roles', 'package.json', 'package-lock.json', 'LICENSE'], runtime);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = spawnSync(npm, ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: runtime,
  stdio: 'inherit',
  env: process.env,
});
if (install.error) throw install.error;
if (install.status !== 0) process.exit(install.status ?? 1);

verifyPlugin(output, { selfContained: true });
const engine = join(runtime, 'src', 'cli', 'deliberate.mjs');
const smoke = spawnSync(process.execPath, [engine, 'help', '--skill'], {
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', SONORANCE_AUTOMATION: '1' },
});
if (smoke.error) throw smoke.error;
if (smoke.status !== 0) throw new Error(smoke.stderr || smoke.stdout || 'bundled plugin runtime smoke failed');
if (!smoke.stdout.includes('/deliberate init') || /\bdeliberate install\b/.test(smoke.stdout)) {
  throw new Error('bundled plugin runtime exposes the wrong command grammar');
}
process.stdout.write(`Built universal self-contained Deliberate distribution ${pkg.version} at ${output}.\n`);
