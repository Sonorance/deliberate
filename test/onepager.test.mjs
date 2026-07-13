import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate SONORANCE_HOME + force the offline stub. The One-pager is a host-run Analyst
// synthesis sub-job (NOT a funnel stage): the engine only builds the producer prompt and
// deterministically persists what the host produces, beside analysis.md.
const home = mkdtempSync(join(tmpdir(), 'dlb-onepager-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';

const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { persistStage, onepagerPrompt, persistOnepager } = await import('../src/engine/service.mjs');
const { createProject } = await import('./project-fixture.mjs');

let store, project, kase;
before(async () => {
  store = openVault();
  project = await createProject(store, 'OnePagerProj');
  kase = store.createCase(project.id, 'CSV export', 'users keep asking to export their data', 1);
  // Drive the full analysis with stub artifacts so the record is complete before the one-pager.
  for (const st of ['frame', 'score', 'shape', 'launch'])
    await persistStage(store, project, kase.id, st, `# ${st}\n\nGrounded ${st} content.\n\n**Score:** 7`);
});
after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });

test('onepagerPrompt: customer-lens skills + the finished record + the one-pager template', async () => {
  const { system, user, model } = await onepagerPrompt(store, project, store.getCase(kase.id));
  // Host-run sub-job: inherits the default/session model (the offline stub here), NOT a
  // dedicated cross-vendor evaluator model. The real-yaml binding is checked in roles.test.
  assert.equal(model, 'stub', 'the one-pager is host-run — it inherits the default (session) model');
  for (const s of ['positioning', 'jtbd'])
    assert.match(system, new RegExp(`### ${s}`), `${s} skill injected into the one-pager prompt`);
  assert.match(system, /internal reverse PR-FAQ/i, 'the instructions frame it as an internal reverse PR-FAQ (customer voice)');
  // Grounds on the FINISHED record — every prior stage's full artifact is in the task.
  for (const s of ['frame', 'shape', 'launch'])
    assert.match(user, new RegExp(`## ${s}`), `the ${s} artifact grounds the one-pager`);
  assert.match(user, /invent no new capabilities/i, 'the task forbids inventing beyond the record');
  // The output template's real sections are present (customer's own voice first).
  assert.match(user, /## The customer's story/);
  assert.match(user, /## Why it matters/);
  assert.match(user, /## FAQ/);
  // The narrative is a reverse press release — the customer's first-person voice.
  const sysFlat = system.replace(/\s+/g, ' ');
  assert.match(sysFlat, /reverse press release/i, 'the one-pager is framed as a reverse press release');
  assert.match(sysFlat, /first person/i, 'the narrative is in the customer\u2019s first-person voice');
});

test('persistOnepager: writes one-pager.md beside analysis.md, unwraps prose, links it from the record', async () => {
  const raw = '# Export in one click\n\nFor busy teams.\n\n## The customer\'s story\n\nI used to dread month-end exports.\nNow I get our data out in a single click.\n\n## FAQ\n\n**Who is this for?**\nTeams drowning in export requests.';
  const { file } = await persistOnepager(store, project, store.getCase(kase.id), raw);
  assert.ok(file.exists, 'persistOnepager reports the file was written');

  const body = store.readOnepager(kase.id);
  assert.ok(body && /# Export in one click/.test(body), 'readOnepager returns the produced page');
  // unwrapProse joins the two hard-wrapped story sentences into one line.
  assert.match(body, /I used to dread month-end exports\. Now I get our data out in a single click\./, 'hard-wrapped prose is unwrapped');
  assert.ok(existsSync(store.onepagerRef(kase.id).path), 'the file lives at the reported path');

  const analysis = readFileSync(store.recordFile(kase.id), 'utf8');
  assert.match(analysis, /## One-pager/, 'analysis.md gains a One-pager link section once the file exists');
  assert.match(analysis, /\]\(\.\/one-pager\.md\)/, 'the link points at the sibling one-pager.md');
});

test('the One-pager link section round-trips: regenerated on rewrite, never leaks into the summary', async () => {
  // Force a structured re-render of analysis.md (a stage metadata update triggers #writeAnalysis).
  store.setStage(kase.id, 'frame', { model: 'claude-opus-4.8' });
  const analysis = readFileSync(store.recordFile(kase.id), 'utf8');
  assert.equal((analysis.match(/## One-pager/g) || []).length, 1, 'the link section appears exactly once after a rewrite');
  // The link's body prose must not be parsed as a stage section or leak into the case summary lede.
  const summaryLede = analysis.split('## ')[0];
  assert.doesNotMatch(summaryLede, /read it/i, 'the one-pager link prose stays in its section, not the summary lede');
});
