import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Isolate SONORANCE_HOME + force the offline stub model before importing the engine.
const home = mkdtempSync(join(tmpdir(), 'dlb-test-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';

const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { persistStage, persistScore, persistPrototype, projectContext, caseDetail } = await import('../src/engine/service.mjs');
const { createProject } = await import('./project-fixture.mjs');
const { STAGES, nextStage, followingStages } = await import('sonorance/plugins/deliberate/stages.mjs');
const { cleanArtifact } = await import('../src/engine/pipeline.mjs');

let store;
before(() => { store = openVault(); });
after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });

// Drive the funnel the way the host does: create a case, then `save` a produced artifact
// for each analysis stage (persistStage) — the engine never runs a stage itself. The score
// is separate (persistScore): the decorrelated Evaluator's recomputable companion.
async function hostFunnel(store, p) {
  const kase = store.createCase(p.id, 'Bulk archive', 'support clusters');
  for (const stage of ['frame', 'shape', 'launch'])
    await persistStage(store, p, kase.id, stage, `# ${stage[0].toUpperCase() + stage.slice(1)}\n\nGrounded ${stage} content.`);
  await persistScore(store, p, store.getCase(kase.id), '# Score\n\n**Score:** 7.6\n\nadvance.', { model: 'gpt-5.4', independent: true });
  return store.getCase(kase.id);
}

test('stages: the funnel is frame → shape → launch; prototype/score are decoupled companions', () => {
  assert.ok(STAGES.includes('frame'), 'frame is a funnel stage');
  assert.ok(!STAGES.includes('build'), 'build is gone');
  assert.ok(!STAGES.includes('score'), 'score is NOT a funnel stage — it is a recomputable companion artifact');
  assert.ok(!STAGES.includes('prototype'), 'prototype is NOT a funnel stage — it is a recomputable companion artifact built on request');
  assert.equal(nextStage('frame'), 'shape', 'shape (concept + journeys) runs right after frame');
  assert.equal(nextStage('shape'), 'launch', 'market (go-to-market) runs after shape');
  assert.equal(nextStage('launch'), null, 'launch is the last funnel stage — the analysis is then complete');
  assert.deepEqual(followingStages('shape'), ['shape', 'launch']);
});

test('persistStage rejects unknown and out-of-order stages without forging completion', async () => {
  const p = await createProject(store, 'StageOrder');
  const kase = store.createCase(p.id, 'Ordered analysis', 'Keep the funnel ordered');
  await assert.rejects(
    persistStage(store, p, kase.id, 'launch', '# Launch\n\nToo early.'),
    /next analysis stage is frame/,
  );
  await assert.rejects(
    persistStage(store, p, kase.id, 'score', '# Score\n\nNot an analysis stage.'),
    /Unknown analysis stage/,
  );
  assert.equal(store.getCase(kase.id).state, 'new');
  assert.deepEqual(store.listStages(kase.id), []);
});

test('project isolation: two projects keep separate cases', async () => {
  const a = await createProject(store, 'Alpha');
  const b = await createProject(store, 'Beta');
  store.createCase(a.id, 'A-case', '', 1);
  assert.equal(store.listCases(a.id).length, 1);
  assert.equal(store.listCases(b.id).length, 0);
});

test('host-driven funnel: save advances frame→shape→launch, records the score, and completes', async () => {
  const p = await createProject(store, 'InboxZero');
  const kase = await hostFunnel(store, p);
  assert.equal(kase.state, 'done', 'after launch the analysis is complete (state done)');
  assert.equal(kase.score, 7.6, 'the decorrelated Evaluator score is stamped on the case');
  assert.match(store.readScore(kase.id), /^evaluator_independent: true$/m, 'the artifact records evaluator independence in frontmatter');
  assert.match(store.readScore(kase.id), /^evaluator_model: gpt-5\.4$/m, 'the artifact records the actual evaluator model');
  const done = caseDetail(store, p.id, kase.id).stages.filter(s => s.status === 'done').length;
  assert.equal(done, 3, 'frame..launch done (3 stages); score/prototype are not stages');
  // On request the host produces + saves the prototype → a companion file; the case stays done.
  await persistPrototype(store, p, store.getCase(kase.id), '# Prototype\n\n```html\n<h1>x</h1>\n```');
  assert.equal(store.getCase(kase.id).state, 'done', 'building the prototype does not change the case state');
  assert.match(store.readStage(p.id, kase.id, 'prototype', 'index.html'), /<h1>x<\/h1>/, 'the prototype index.html is written beside the record');
  // A second prototype for a NAMED primary surface nests under prototype/<surface>/index.html; both
  // are listed and the record links each one under ## Prototype.
  await persistPrototype(store, p, store.getCase(kase.id), '# Prototype\n\n```html\n<pre>$ deliberate ...</pre>\n```', 'cli');
  assert.match(store.readStage(p.id, kase.id, 'prototype', 'cli/index.html'), /deliberate \.\.\./, 'the cli surface prototype nests under prototype/cli/');
  const surfaces = store.listPrototypes(kase.id).map(s => s.surface);
  assert.ok(surfaces.includes(null) && surfaces.includes('cli'), 'listPrototypes reports the default + the cli surface');
  const rec = readFileSync(store.recordFile(kase.id), 'utf8');
  assert.match(rec, /## Prototype[\s\S]*prototype\/index\.html/, 'record links the default prototype');
  assert.match(rec, /prototype\/cli\/index\.html/, 'record links the cli-surface prototype');
});

test('score provenance is required and visibly distinguishes a same-session fallback', async () => {
  const p = await createProject(store, 'ScoreProvenance');
  const kase = store.createCase(p.id, 'A scored idea', 'Grounded input');
  await assert.rejects(
    persistScore(store, p, kase, '# Score\n\n**Score:** 6', { model: 'claude-opus-4.8', independent: false }),
    /requires a completed case/,
  );
  store.setCase(kase.id, { state: 'done' });
  await assert.rejects(
    persistScore(store, p, store.getCase(kase.id), '# Score\n\n**Score:** 6', { model: 'claude-opus-4.8', independent: false }),
    /requires a completed case/,
    'editing state alone cannot bypass the completed-stage invariant',
  );
  store.setCase(kase.id, { state: 'new' });
  for (const stage of ['frame', 'shape', 'launch'])
    await persistStage(store, p, kase.id, stage, `# ${stage}\n\nGrounded ${stage}.`);
  const completed = store.getCase(kase.id);
  await assert.rejects(
    persistScore(store, p, completed, '# Score\n\n**Score:** 6'),
    /requires a valid evaluator model id/,
  );
  await persistScore(store, p, completed, '# Score\n\n**Score:** 6', { model: 'claude-opus-4.8', independent: false });
  assert.match(store.readScore(kase.id), /Same-session fallback[\s\S]*not an independent second opinion/, 'fallback provenance is visible to readers');
  assert.match(store.readScore(kase.id), /^evaluator_independent: false$/m, 'fallback status is machine-readable');
});

test('persistStage completes the analysis after launch (no gate, no prototype state)', async () => {
  const p = await createProject(store, 'GateFlag');
  const kase = store.createCase(p.id, 'g', '', 1);
  let r;
  for (const stage of ['frame', 'shape', 'launch']) r = await persistStage(store, p, kase.id, stage, `# ${stage}\n\nx`);
  assert.equal(r.next, null, 'launch is the last funnel stage');
  assert.equal(store.getCase(kase.id).state, 'done', 'the case is done after launch');
  assert.equal(r.gate, undefined, 'there is no engine gate in the persist result');
  await assert.rejects(
    persistStage(store, p, kase.id, 'launch', '# launch\n\nagain'),
    /analysis is already complete/,
    'a completed stage cannot be appended twice through the raw engine helper',
  );
});

test('delete case removes it and its stages', async () => {
  const p = await createProject(store, 'Del');
  const kase = store.createCase(p.id, 's', '', 1);
  await persistStage(store, p, kase.id, 'frame', '# Frame\n\nx');
  store.deleteCase(kase.id);
  assert.equal(store.getCase(kase.id), undefined);
  assert.equal(store.listStages(kase.id).length, 0);
});

test('cleanArtifact strips echoed template guidance + internal/meta lines (keeps real content + code)', async () => {
  const template = "# Compete\n\n_Whether today's alternatives already offer **what this case proposes** — and where it differs._\n\n## Analysis\n";
  const art = [
    '# Compete',
    '',
    "_Whether today's alternatives already offer what this case proposes — and where it differs._",  // reformatted copy (bold dropped)
    '',
    '## Analysis',
    'The artifact was already produced in my previous response.',   // internal/meta
    'As an AI assistant, I cannot determine the answer.',          // internal/meta
    'Dovetail uses Workspace Docs as AI context for research.',    // real content
    'Competitor X does not offer it today.',                        // real content
    '```',
    '_this italic line is inside code — keep it_',
    '```',
  ].join('\n');
  const out = cleanArtifact(art, template);
  assert.ok(!/Whether today/.test(out), 'echoed template guidance is stripped even when reformatted');
  assert.ok(!/previous response/.test(out), 'internal/run/meta commentary is stripped');
  assert.doesNotMatch(out, /cannot determine the answer/, 'as-an-AI meta commentary is stripped');
  assert.match(out, /Workspace Docs as AI context/, 'legitimate AI-context language is preserved');
  assert.match(out, /Competitor X does not offer it today/, 'real content is preserved');
  assert.match(out, /# Compete/, 'the top header is preserved (UI strips it, not the engine)');
  assert.match(out, /## Analysis/, 'sub-headers are preserved');
  assert.match(out, /_this italic line is inside code — keep it_/, 'italic lines inside code fences are left untouched');
});

test('persistStage unwraps hard-wrapped prose in the record; persistPrototype never reflows the HTML', async () => {
  const p = await createProject(store, 'Unwrap');
  const s = store.createCase(p.id, 'Film LUTs', 'a case', 1);
  // A hard-wrapped frame paragraph → one logical line in the saved record.
  const frame = '# Frame\n\n## Problem\n\nNo — as scoped, the export carries no attribution back to the app, so\nsharing a photo does not expose new viewers; there is no growth loop.';
  await persistStage(store, p, s.id, 'frame', frame);
  const rec = store.readStage(p.id, s.id, 'frame', 'output_full.md');
  assert.match(rec, /no attribution back to the app, so sharing a photo does not expose new viewers/, 'the wrapped paragraph is joined into one line');
  assert.doesNotMatch(rec, /app, so\nsharing/, 'no mid-sentence hard break survives in the record');
  // The prototype's bare HTML/JS must survive line-for-line (never unwrapped).
  const html = '```html\n<!DOCTYPE html>\n<script>\nconst a = 1\nconst b = 2\n</script>\n```';
  await assert.rejects(() => persistPrototype(store, p, store.getCase(s.id), html), /requires a completed case/);
  for (const stage of ['shape', 'launch'])
    await persistStage(store, p, s.id, stage, `# ${stage}\n\nGrounded ${stage}.`);
  await persistPrototype(store, p, store.getCase(s.id), html);
  const proto = store.readStage(p.id, s.id, 'prototype', 'index.html');
  assert.match(proto, /const a = 1\nconst b = 2/, 'the prototype JS keeps its line breaks (not joined)');
});

test('project context is injected into agent prompts (Copilot grounding)', async () => {
  const p = await createProject(store, 'Ctx');
  store.addSource(p.id, 'github.com/me/app'); store.setRepo(p.id, 'github.com/me/app');
  store.writeContext(p.id, '# App — project context\n\n## Personas\n\n- indie SaaS founders\n\n## Objective\n\nretention\n');
  const block = projectContext(store, store.getProject(p.id));
  assert.match(block, /## Product context \(product\.md, read-only\)/, 'the block wraps the host-written context');
  assert.match(block, /indie SaaS founders/); assert.match(block, /retention/);
  assert.match(block, /read-only.*github\.com\/me\/app/, 'the connected repo is noted');
  assert.match(block, /Attached external sources:/);
});

test('projectContext passes external sources with descriptions and excludes legacy in-project entries', async () => {
  const p = await createProject(store, 'CtxSrc');
  store.addSource(p.id, 'https://docs.example.com', 'The product docs site — grounds terminology and features.');
  store.writeCompetitors(p.id, '# Competitors\n\n## RivalCo\n\n- **Overlap:** Direct rival.');
  store.writeEcosystem(p.id, '# Ecosystem\n\n## PlatformCo — Dependency, current\n\n- **What it is to us:** Runtime.');
  const outside = join(dirname(p.dir), 'external-research.md');
  const inside = join(p.dir, 'docs', 'local-context.md');
  store.addSource(p.id, outside, null);
  store.addSource(p.id, inside, 'Legacy local source');
  const ctx = projectContext(store, store.getProject(p.id));
  assert.match(ctx, /### Attached external sources:/, 'an attached-sources section is present');
  assert.match(ctx, /https:\/\/docs\.example\.com — The product docs site/, 'a described source is passed with its blurb');
  assert.match(ctx, /## Competitor context \(competitors\.md, read-only\)[\s\S]*RivalCo/);
  assert.match(ctx, /## Ecosystem context \(ecosystem\.md, read-only\)[\s\S]*PlatformCo/);
  assert.match(ctx, /external-research\.md(?! —)/, 'an external path without a description is still listed (no dangling dash)');
  assert.doesNotMatch(ctx, /local-context\.md|Legacy local source/, 'in-project source entries are not injected');
});
