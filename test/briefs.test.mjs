import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate SONORANCE_HOME + force the offline stub model before importing the engine.
const home = mkdtempSync(join(tmpdir(), 'dlb-briefs-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';

const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { briefWindow, briefPrompt, persistBrief, BRIEF_WINDOW_MONTHS } = await import('../src/engine/briefs.mjs');
const { createProjectWithId } = await import('./project-fixture.mjs');

let store, pid;
before(() => { store = openVault(); pid = createProjectWithId(store, 'bp', 'BriefProj').id; });
after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });

const DAY = 86400000;
const monthsBefore = (ts, n) => { const d = new Date(ts); d.setMonth(d.getMonth() - n); return d.getTime(); };

test('briefWindow: a first-ever brief looks back exactly 3 months (the cap)', () => {
  const now = Date.now();
  const w = briefWindow(store, pid, now);
  assert.equal(w.firstEver, true, 'no prior brief → firstEver');
  assert.equal(w.end, now, 'the window ends now');
  assert.equal(w.start, monthsBefore(now, BRIEF_WINDOW_MONTHS), 'starts exactly 3 calendar months back');
});

test('briefWindow: with a RECENT previous brief, the window starts where the last one ended', () => {
  const now = Date.now();
  const lastEnd = now - 10 * DAY;                 // a brief 10 days ago
  store.createBrief(pid, { period_start: now - 40 * DAY, period_end: lastEnd, body: '# Brief\n\n* x' }, lastEnd);
  const w = briefWindow(store, pid, now);
  assert.equal(w.firstEver, false, 'a prior brief exists');
  assert.equal(w.capped, false, 'the prior brief is within 3 months → not capped');
  assert.equal(w.start, lastEnd, 'the window picks up exactly where the last brief ended');
});

test('briefWindow: a STALE previous brief (older than 3 months) is capped back to 3 months', () => {
  const p2 = createProjectWithId(store, 'bp2', 'Stale').id;
  const now = Date.now();
  const staleEnd = monthsBefore(now, 5);         // last brief ended 5 months ago
  store.createBrief(p2, { period_start: monthsBefore(now, 6), period_end: staleEnd, body: '# Brief\n\n* old' }, staleEnd);
  const w = briefWindow(store, p2, now);
  assert.equal(w.capped, true, 'older than 3 months → capped');
  assert.equal(w.start, monthsBefore(now, BRIEF_WINDOW_MONTHS), 'clamped to the 3-month floor, not all the way back to the stale brief');
});

test('briefPrompt: a later brief is told it is NOT the first and anchored to the previous end', async () => {
  const p = createProjectWithId(store, 'bp-follow', 'FollowProj').id;
  store.writeContext(p, '# FollowProj\n\n## Competitors\n\n- Acme — a rival.\n');
  const now = Date.now();
  const lastEnd = now - 2 * DAY;                  // a tight, 2-day window since the last brief
  store.createBrief(p, { period_start: now - 90 * DAY, period_end: lastEnd, body: '# Brief\n\n* prior' }, lastEnd);
  const { user } = await briefPrompt(store, store.getProject(p), { at: now });
  assert.match(user, /NOT the first brief for this project/, 'the prompt states it is not the first brief');
  assert.match(user, /previous brief covered through/, 'it anchors to the previous brief\'s end date');
  assert.doesNotMatch(user, /FIRST brief for this project/, 'it does not claim to be the first brief');
  assert.match(user, /never label it a "first brief" or tie it to project creation/, 'the Period line forbids the first-brief parenthetical');
});

test('briefPrompt: a FIRST-ever brief is explicitly told it is the first', async () => {
  const p = createProjectWithId(store, 'bp-first', 'FirstProj').id;
  store.writeContext(p, '# FirstProj\n\n## Competitors\n\n- Acme — a rival.\n');
  const { user } = await briefPrompt(store, store.getProject(p));
  assert.match(user, /FIRST brief for this project — there is no previous brief/, 'the first brief is labelled first');
});

test('briefPrompt: a later brief injects the previous brief as read-only prior context', async () => {
  const p = createProjectWithId(store, 'bp-prev', 'PrevInject').id;
  store.writeContext(p, '# PrevInject\n\n## Competitors\n\n- Acme — a rival.\n');
  const now = Date.now();
  const lastEnd = now - 2 * DAY;
  store.createBrief(p, { period_start: now - 90 * DAY, period_end: lastEnd, body: '# Brief\n\n## Key highlights\n\n* Acme shipped a caching layer. [Source](https://acme.example/x)' }, lastEnd);
  const { user } = await briefPrompt(store, store.getProject(p), { at: now });
  assert.match(user, /Previous brief — read-only prior context/, 'the prior brief is injected as a block');
  assert.match(user, /Acme shipped a caching layer/, 'the previous brief body is included so it can be deduped against');
  assert.match(user, /Do NOT re-report anything it already covered/, 'the no-re-report instruction is present');
  assert.doesNotMatch(user, /type: brief/, 'the injected prior brief has its frontmatter stripped');
});

test('briefPrompt: a FIRST-ever brief injects NO previous-brief block', async () => {
  const p = createProjectWithId(store, 'bp-noprev', 'NoPrev').id;
  store.writeContext(p, '# NoPrev\n\n## Competitors\n\n- Acme — a rival.\n');
  const { user } = await briefPrompt(store, store.getProject(p));
  assert.doesNotMatch(user, /Previous brief — read-only prior context/, 'a first brief has no prior-context block');
});

test('briefPrompt: injects the reporting window + competitors + ecosystem + landscape-scan skill', async () => {
  const p3 = createProjectWithId(store, 'bp3', 'PromptProj').id;
  store.writeContext(p3, '# PromptProj\n\n## Competitors\n\n- Acme — a rival.\n');
  store.writeCompetitors(p3, '# Competitors\n\n## Acme\n\n- [Blog](https://acme.example/blog)\n');
  store.writeEcosystem(p3, '# Ecosystem\n\n## Nodely — Dependency, current\n\n- [Releases](https://nodely.example/releases)\n');
  const { system, user } = await briefPrompt(store, store.getProject(p3));
  assert.match(user, /Reporting window \(STRICT\)/, 'the task states the strict window');
  assert.match(user, /period_start:/, 'the window has a start');
  assert.match(user, /period_end:/, 'the window has an end');
  assert.match(user, /----- OUTPUT TEMPLATE -----/, 'the template is appended');
  assert.match(system, /Landscape Scan/i, 'the landscape-scan skill is injected');
  assert.match(system, /acme\.example\/blog/, 'the competitor monitoring sources are injected');
  assert.match(system, /Ecosystem monitoring sources \(ecosystem\.md\)/, 'the ecosystem block header is injected');
  assert.match(system, /nodely\.example\/releases/, 'the ecosystem monitoring sources are injected');
  assert.match(system, /Briefer/, 'the Briefer instructions are injected');
  assert.match(system, /name the actor\/product, the concrete change, its dated\/source-backed evidence/i, 'highlights must identify concrete, dated signals');
  assert.match(system, /why it matters specifically to this project/i, 'highlights must explain product-specific significance');
  assert.match(system, /what decision or investigation is warranted.*why it is valuable now.*decision it would unlock/is, 'actions must be decision-ready');
  assert.match(system, /problems\/decisions that can become Cases, not as predetermined solutions/i, 'Case candidates preserve the problem and decision rather than prescribing a solution');
  assert.match(user, /Actor\/product.*concrete change with dated.*evidence.*why it matters to this project/is, 'the output template reinforces concrete highlights');
  assert.match(user, /Action\/decision.*motivating finding.*why now.*decision unlocked/is, 'the output template reinforces decision-ready actions');
});

test('persistBrief: cleans the artifact, records the window, and writes brief.md', async () => {
  const p4 = createProjectWithId(store, 'bp4', 'PersistProj').id;
  const raw = '# Brief\n\nPeriod: test.\n\nThis completes the task.\n\n## Key highlights\n\n* A real thing shipped. [Source](https://x.example)\n';
  const { brief, window } = await persistBrief(store, store.getProject(p4), raw);
  assert.ok(/[a-f]/.test(brief.id), 'the brief has a hash id (the only handle — no sequential number)');
  assert.equal(brief.period_start, window.start, 'stores the authoritative window start');
  assert.equal(brief.period_end, window.end, 'stores the authoritative window end');
  const rec = store.readBriefRecord(brief.id);
  assert.match(rec.text, /A real thing shipped/, 'the real content is kept');
  assert.doesNotMatch(rec.text, /This completes the task/, 'internal/run meta commentary is scrubbed');
});

test('persistBrief unwraps hard-wrapped prose so the saved file isn\'t artificially broken into lines', async () => {
  const p = createProjectWithId(store, 'bp-unwrap', 'Unwrap').id;
  const raw = '# Brief\n\n## Key highlights\n\n* A rival shipped an AI gateway that carries no attribution back to us, so\nsharing it does not expose new viewers; there is no built-in growth loop. [Source](https://x.example)\n';
  const { brief } = await persistBrief(store, store.getProject(p), raw);
  const rec = store.readBriefRecord(brief.id);
  assert.match(rec.text, /shipped an AI gateway that carries no attribution back to us, so sharing it does not expose new viewers/, 'the wrapped bullet is joined into one line');
  assert.doesNotMatch(rec.text, /back to us, so\nsharing/, 'no mid-sentence hard break survives');
});

test('successive briefs chain: the next brief starts where the previous ended', async () => {
  const p5 = createProjectWithId(store, 'bp5', 'Chain').id;
  const t1 = Date.now() - 20 * DAY;
  const { brief: b1 } = await persistBrief(store, store.getProject(p5), '# Brief\n\n* one', { at: t1 });
  const w2 = briefWindow(store, p5, Date.now());
  assert.equal(w2.start, b1.period_end, 'the next window starts at the previous brief\'s end');
});
