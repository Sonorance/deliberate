import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// The installed /deliberate skill (skills/deliberate/SKILL.md) is a first-class product surface: it is what a
// harness reads to drive Deliberate. It MUST NOT drift from the evolving grammar (the command
// registry in commands.mjs + the filesystem layout in layout.mjs) or from the product definition.
// These tests hold SKILL.md against those single sources of truth so a grammar/positioning change
// cannot merge without the skill being updated in the same pass.

process.env.SONORANCE_HOME = process.env.SONORANCE_HOME || '/tmp/son-skill-currency-test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(repoRoot, 'skills/deliberate/SKILL.md'), 'utf8');
const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
assert.ok(fmMatch, 'SKILL.md has a --- frontmatter block');
const frontmatter = yaml.load(fmMatch[1]);
const body = fmMatch[2];

const { SKILL_COMMANDS, SKILL_FOLLOW_UPS } = await import('../src/engine/commands.mjs');
const { FS_LAYOUT } = await import('../src/engine/layout.mjs');
const fsPaths = FS_LAYOUT.map((r) => (Array.isArray(r) ? r[0] : r.path ?? r));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every literal (non-placeholder) token a user types in a `/deliberate …` line — the top-level verb
// AND its sub-verbs (score, prototype, list, add, remove). Placeholders (<idea>, <id>, "…") are dropped.
const literalTokens = (cmd) =>
  cmd
    .replace('/deliberate', '')
    .trim()
    .split(/\s+/)
    .flatMap((t) => t.split('|')) // source add|remove → add, remove
    .filter((t) => t && !/^[<[]/.test(t));

const topVerbs = [...new Set(SKILL_COMMANDS.map(([c]) => c.replace('/deliberate ', '').split(/\s+/)[0]))];

test('the frontmatter description stays within Copilot skill discovery limits', () => {
  const description = String(frontmatter.description || '');
  assert.ok(description.length > 40, 'description carries enough routing context');
  assert.ok(description.length <= 1024, `description is ${description.length} characters; Copilot allows at most 1024`);
});

test('SKILL.md documents every command in the grammar, sub-verbs included (commands.mjs SKILL_COMMANDS)', () => {
  for (const [cmd] of SKILL_COMMANDS)
    for (const tok of literalTokens(cmd))
      assert.match(
        body,
        new RegExp(`\\b${esc(tok)}\\b`),
        `SKILL.md never documents \`${tok}\` (from grammar command \`${cmd}\`) — update the skill or the grammar together`,
      );
});

test('every skill command has exactly one ordered follow-up contract', () => {
  assert.deepEqual(
    SKILL_FOLLOW_UPS.map(([command]) => command),
    SKILL_COMMANDS.map(([command]) => command),
  );
});

test('the frontmatter argument-hint lists every top-level command verb', () => {
  const hint = String(frontmatter['argument-hint'] || '');
  for (const v of topVerbs)
    assert.match(hint, new RegExp(`\\b${esc(v)}\\b`), `argument-hint omits the \`${v}\` command`);
});

test('/deliberate help delegates to the live SKILL_COMMANDS renderer', () => {
  const help = body.slice(body.indexOf('## `help`'), body.indexOf('## `init`'));
  assert.match(help, /LAUNCHER help --skill/, 'the harness invokes the engine’s live user-grammar renderer');
  assert.match(help, /present its output verbatim/i, 'the harness does not rewrite or hand-maintain the command list');
  assert.match(help, /before project initialization/i, 'help remains available before init');
});

// ---- filesystem grammar (layout.mjs FS_LAYOUT) -----------------------------
// Normalize a path so a SKILL.md citation and an FS_LAYOUT entry can be compared regardless of the
// placeholder wording each uses: unwrap optional [..], collapse every <..> placeholder to <*>, drop
// the … ellipsis, and strip a trailing slash.
const normPath = (s) =>
  s
    .replace(/\[([^\]]*)\]/g, '$1')
    .replace(/<[^>]+>/g, '<*>')
    .replace(/…/g, '')
    .replace(/\/+$/, '');

// A code span is a path citation only if it is rooted in the grammar (excludes slash-commands,
// URLs, and script/tooling paths such as `*.mjs` or `.github/…`).
const PATH_ROOTS = ['deliberate/', '.sonorance/', '~/.sonorance', 'context/', 'prototype/'];
const isPathToken = (t) =>
  t.includes('/') &&
  !t.startsWith('/') &&
  !/\s/.test(t) &&
  !t.includes('.mjs') &&
  !t.includes('.github') &&
  !/^https?:/.test(t) &&
  PATH_ROOTS.some((r) => t.startsWith(r));

const normFs = fsPaths.map(normPath);
const grounded = (p) => normFs.some((f) => f === p || f.startsWith(p + '/') || f.endsWith('/' + p));

test('every on-disk path SKILL.md cites is grounded in the filesystem grammar (layout.mjs FS_LAYOUT)', () => {
  const tokens = [...new Set([...body.matchAll(/`([^`]+)`/g)].map((x) => x[1]))].filter(isPathToken);
  assert.ok(tokens.length >= 3, 'sanity: SKILL.md still cites on-disk paths in code spans');
  for (const t of tokens)
    assert.ok(
      grounded(normPath(t)),
      `SKILL.md cites the path \`${t}\`, but no FS_LAYOUT entry matches — stale path? Update the skill or layout.mjs`,
    );
});

test('SKILL.md documents every user-visible artifact in the filesystem grammar (no undocumented deliberate/** file)', () => {
  const leaves = [
    ...new Set(
      fsPaths
        .filter((p) => /^deliberate\/.*\.(md|html)$/.test(p) && !p.includes('*'))
        .map((p) => p.split('/').pop()),
    ),
  ];
  assert.ok(leaves.length >= 5, 'sanity: FS_LAYOUT still enumerates deliberate/** artifacts');
  for (const leaf of leaves)
    assert.ok(body.includes(leaf), `FS_LAYOUT ships \`${leaf}\` but SKILL.md never mentions it — document the artifact`);
});

// ---- product definition ----------------------------------------------------
test('SKILL.md stays current with the product definition (broad toolkit framing + the Sonorance division)', () => {
  // Broad audience — not a bare "decision pipeline" (the regression this file guards against).
  assert.match(
    String(frontmatter.description),
    /product manager|founder|marketing/i,
    'the description names Deliberate\u2019s broad audience',
  );
  assert.match(body, /toolkit|suite/i, 'the intro frames Deliberate as a toolkit/suite, not one pipeline');
  // The Deliberate ↔ Sonorance platform division must be stated (the part that had gone stale).
  assert.match(body, /Sonorance/, 'names the Sonorance platform it runs on');
  // Structural anchors tied to the command grammar.
  assert.match(body, /^##\s+Commands/m, 'has a Commands section');
  assert.match(body, /^##\s+Rules/m, 'has a Rules section');
  for (const v of ['init', 'case', 'brief', 'matchup', 'address'])
    assert.match(body, new RegExp('^##\\s+`' + esc(v), 'm'), `has a dedicated \`${v}\` section`);
});
