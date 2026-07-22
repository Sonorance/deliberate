#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyPlugin } from './verify-plugin.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(repoRoot, 'dist', 'deliberate-plugin');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(repoRoot, 'plugin.json'), 'utf8'));
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

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
manifest.version = pkg.version;
writeFileSync(join(output, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
copyTracked(['skill', 'LICENSE', 'README.md'], output);

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
const installTarget = mkdtempSync(join(tmpdir(), 'deliberate-plugin-install-'));
try {
  const engine = join(runtime, 'src', 'cli', 'deliberate.mjs');
  const smoke = spawnSync(process.execPath, [engine, 'install', '--project', installTarget], {
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', SONORANCE_AUTOMATION: '1' },
  });
  if (smoke.error) throw smoke.error;
  if (smoke.status !== 0) throw new Error(smoke.stderr || smoke.stdout || 'bundled plugin install smoke failed');
  const installed = join(installTarget, '.github', 'skills', 'deliberate');
  if (!existsSync(join(installed, 'SKILL.md'))) throw new Error('bundled plugin install did not copy SKILL.md');
  const config = JSON.parse(readFileSync(join(installed, 'scripts', 'engine.json'), 'utf8'));
  if (config.engine !== engine) throw new Error('bundled plugin install did not retain its self-contained runtime');
} finally {
  rmSync(installTarget, { recursive: true, force: true });
}
process.stdout.write(`Built self-contained Deliberate plugin ${pkg.version} at ${output}.\n`);
