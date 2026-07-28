import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate SONORANCE_HOME + force the offline stub model before importing the engine.
const home = mkdtempSync(join(tmpdir(), 'dlb-matchups-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';

const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { matchupPrompt, persistMatchup, matchupAsOfLabel } = await import('../src/engine/matchups.mjs');
const { createProjectWithId } = await import('./project-fixture.mjs');

let store, pid;
before(() => { store = openVault(); pid = createProjectWithId(store, 'mp', 'MatchupProj').id; store.writeContext(pid, '# MatchupProj\n\n## Competitors\n\nSee [competitors.md](./competitors.md).\n'); });
after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });

test('matchupPrompt: injects the rival, the as-of date, competitors, the head-to-head skill + Scout', async () => {
  store.writeCompetitors(pid, '# Competitors\n\n## Acme\n\n- **Overlap:** Direct rival.\n\n### Monitoring sources\n\n- [Blog](https://acme.example/blog)\n');
  const at = Date.UTC(2026, 6, 8);   // 2026-07-08
  const { system, user } = await matchupPrompt(store, store.getProject(pid), 'Acme', { at });
  assert.match(user, /The rival \(STRICT\)/, 'the task names the rival strictly');
  assert.match(user, /competitor: Acme/, 'the rival name is injected');
  assert.match(user, /as_of: July 8, 2026/, 'the as-of date is injected');
  assert.match(user, /already tracked in competitors\.md/, 'a tracked rival is flagged as tracked');
  assert.match(user, /----- OUTPUT TEMPLATE -----/, 'the template is appended');
  assert.match(system, /Head-to-Head/i, 'the head-to-head skill is injected');
  assert.match(system, /acme\.example\/blog/, 'the competitor monitoring sources are injected');
  assert.match(system, /Scout/, 'the Scout instructions are injected');
  assert.match(system, /case-worthy decisions/i, 'the Scout extracts only consequential unresolved decisions for case analysis');
  assert.match(user, /## Recommended cases/, 'the output template gives recommended cases their own section');
  assert.match(user, /triggering insight.*why analysis is valuable now.*decision it would unlock/is, 'recommended cases preserve the rationale needed for the follow-up CTA');
});

test('matchupPrompt: an untracked rival is told to research it from scratch and ask to add it', async () => {
  const { user } = await matchupPrompt(store, store.getProject(pid), 'UntrackedCo');
  assert.match(user, /NOT yet tracked in competitors\.md/, 'an untracked rival is flagged');
  assert.match(user, /ask the user whether to add it/, 'the Scout is told to ask (default yes) about adding it');
  assert.match(user, /default yes/, 'the add prompt defaults to yes');
  assert.match(user, /only to competitors\.md/, 'the rival is added to the canonical file only');
  assert.doesNotMatch(user, /roster in product\.md|Competitors roster in product\.md/);
});

test('matchupPrompt: a first matchup for a rival injects NO prior-read block', async () => {
  const { user } = await matchupPrompt(store, store.getProject(pid), 'Umbrella');
  assert.doesNotMatch(user, /Existing matchup — read-only prior read/, 'a first matchup has no prior-read block');
});

test('matchupPrompt: with an existing matchup, the prior read is injected for an in-place refresh', async () => {
  await persistMatchup(store, store.getProject(pid), 'Globex', '# Matchup — Globex vs Us\n\nAs of July 1, 2026.\n\n## Bottom line\n\nGlobex ships a caching layer. [Source](https://globex.example/x)\n');
  const { user } = await matchupPrompt(store, store.getProject(pid), 'Globex');
  assert.match(user, /Existing matchup — read-only prior read/, 'the prior matchup is injected');
  assert.match(user, /Globex ships a caching layer/, 'the prior body is included so it can be refreshed in place');
  assert.match(user, /REFRESHING it in place/, 'the refresh-in-place instruction is present');
  assert.doesNotMatch(user, /type: matchup/, 'the injected prior matchup has its frontmatter stripped');
});

test('persistMatchup: cleans the artifact, stamps as_of, and writes matchup.md keyed by the rival', async () => {
  const at = Date.UTC(2026, 6, 8);
  const raw = '# Matchup — Initech vs Us\n\nAs of test.\n\nThis completes the task.\n\n## Bottom line\n\nInitech is a real rival. [Source](https://initech.example)\n';
  const { matchup } = await persistMatchup(store, store.getProject(pid), 'Initech', raw, { at });
  assert.ok(/[a-f]/.test(matchup.id), 'the matchup has a hash id (the cross-collaborator handle)');
  assert.equal(matchup.competitor, 'Initech', 'stores the rival name');
  assert.equal(matchup.as_of, at, 'stamps the authoritative as-of date');
  assert.ok(matchup.slug, 'derives a folder slug from the rival');
  const rec = store.readMatchupRecord(matchup.id);
  assert.match(rec.text, /Initech is a real rival/, 'the real content is kept');
  assert.doesNotMatch(rec.text, /This completes the task/, 'internal/run meta commentary is scrubbed');
});

test('persistMatchup: re-running the same rival REFRESHES IN PLACE (same id + created_at, new as_of, one folder)', async () => {
  const t1 = Date.UTC(2026, 5, 1), t2 = Date.UTC(2026, 6, 1);
  const { matchup: m1 } = await persistMatchup(store, store.getProject(pid), 'Soylent', '# Matchup\n\n## Bottom line\n\nv1. [Source](https://soylent.example/1)\n', { at: t1 });
  const { matchup: m2 } = await persistMatchup(store, store.getProject(pid), 'Soylent', '# Matchup\n\n## Bottom line\n\nv2 refreshed. [Source](https://soylent.example/2)\n', { at: t2 });
  assert.equal(m2.id, m1.id, 'the id is preserved across a refresh');
  assert.equal(m2.created_at, m1.created_at, 'the creation date is preserved across a refresh');
  assert.equal(m2.as_of, t2, 'the as-of date is restamped to the refresh');
  assert.ok(m2.updated_at >= m1.updated_at, 'updated_at moves forward');
  const all = store.listMatchups(pid).filter(m => m.slug === m1.slug);
  assert.equal(all.length, 1, 'there is exactly ONE canonical matchup per rival (refresh-in-place, no dated copies)');
  const rec = store.readMatchupRecord(m2.id);
  assert.match(rec.text, /v2 refreshed/, 'the refreshed body replaces the prior one');
  assert.doesNotMatch(rec.text, /v1\./, 'the prior body is gone (refreshed in place)');
});

test('persistMatchup unwraps hard-wrapped prose so the saved file isn\'t artificially broken into lines', async () => {
  const raw = '# Matchup\n\n## Bottom line\n\nA rival shipped an AI gateway that carries no attribution back to us, so\nsharing it does not expose new viewers. [Source](https://x.example)\n';
  const { matchup } = await persistMatchup(store, store.getProject(pid), 'Wrapco', raw);
  const rec = store.readMatchupRecord(matchup.id);
  assert.match(rec.text, /carries no attribution back to us, so sharing it does not expose new viewers/, 'the wrapped line is joined');
  assert.doesNotMatch(rec.text, /back to us, so\nsharing/, 'no mid-sentence hard break survives');
});

test('persistMatchup: a stray producer frontmatter is scrubbed so the saved file has ONE metadata block', async () => {
  const raw = '---\ncompetitor: Vandelay\nas_of: 2026-07-09\nverdict: We win on runtime.\n---\n# Matchup — Vandelay vs Us\n\nAs of July 9, 2026.\n\n## Bottom line\n\nVandelay is a rival. [Source](https://vandelay.example)\n';
  const { matchup } = await persistMatchup(store, store.getProject(pid), 'Vandelay', raw, { at: Date.UTC(2026, 6, 9) });
  const rec = store.readMatchupRecord(matchup.id);
  const bodyAfterStore = rec.text.replace(/^---\n[\s\S]*?\n---\n?/, '');   // drop the store's own frontmatter
  assert.doesNotMatch(bodyAfterStore, /verdict:/, 'no second frontmatter survives into the body');
  assert.equal((rec.text.match(/^---$/gm) || []).length, 2, 'exactly one frontmatter block (its two --- fences), not two');
  assert.match(rec.text, /# Matchup — Vandelay vs Us/, 'the real heading is preserved');
});

test('matchupAsOfLabel formats a timestamp as a human-readable date', () => {
  assert.equal(matchupAsOfLabel(Date.UTC(2026, 6, 8)), 'July 8, 2026');
});
