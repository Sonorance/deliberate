/**
 * scaffold.mjs — write a Deliberate project's starter context files (product.md, competitors.md, ecosystem.md).
 *
 * This is agent-init IP: the scaffolds are the Initiator role's **output templates** — declared in
 * `roles/config.yaml` (init.templates.product / .competitors / .ecosystem) and read at project creation with
 * `{{name}}` substituted. It lives in the SKILL (not the app's bundled record store) because it is
 * part of `deliberate init`: the Sonorance host only registers the vault; the Deliberate skill lays
 * down its visible starter content. Idempotent — never overwrites a file that already exists.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentConfig } from './roles.mjs';
import { contextFile, competitorsFile, ecosystemFile } from 'sonorance/plugins/deliberate/paths.mjs';

// Skill-repo root (this file is at <skill>/src/engine/scaffold.mjs) → resolve role template paths.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoFile = (rel) => join(REPO_ROOT, rel);

const contextScaffold = (kind, subs = {}) => {
  const rel = agentConfig('init').templates[kind];   // path from roles/config.yaml
  const text = readFileSync(repoFile(rel), 'utf8');
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k) => subs[k] ?? '');
};

const writeIfAbsent = (p, content) => { if (!existsSync(p)) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); } };

const CONTEXT_POINTER = '## Product context for agents\n\nDetailed product context for agentic workflows is maintained in [`deliberate/context/`](deliberate/context/). Agents should read those files before product, strategy, market, positioning, or implementation work so decisions stay grounded in the project’s goals, users, competitors, and ecosystem.\n';

export function ensureContextPointer(project) {
  const candidates = readdirSync(project.dir)
    .filter(name => /^readme(?:\.md|\.markdown)?$/i.test(name))
    .sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : a.localeCompare(b)));
  const readme = join(project.dir, candidates[0] || 'README.md');
  if (!existsSync(readme)) {
    writeFileSync(readme, `# ${project.name}\n\n${CONTEXT_POINTER}`);
    return readme;
  }
  const current = readFileSync(readme, 'utf8');
  if (/deliberate\/context\/?/.test(current)) return readme;
  const separator = current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(readme, `${current}${separator}${CONTEXT_POINTER}`);
  return readme;
}

// Lay down the starter context for a freshly created / opened Deliberate vault.
export function scaffoldContext(project) {
  if (!project || !project.dir) return project;
  writeIfAbsent(contextFile(project.dir), contextScaffold('product', { name: project.name }));
  writeIfAbsent(competitorsFile(project.dir), contextScaffold('competitors'));
  writeIfAbsent(ecosystemFile(project.dir), contextScaffold('ecosystem'));
  ensureContextPointer(project);
  return project;
}
