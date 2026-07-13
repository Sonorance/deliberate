import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate SONORANCE_HOME and force the offline stub. Prompts are built directly via
// `stagePrompt` (the same builder the `deliberate prompt` command prints) — the host
// harness produces artifacts, so there is no engine run to capture.
const home = mkdtempSync(join(tmpdir(), 'dlb-prompts-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';

const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { stagePrompt, persistStage } = await import('../src/engine/service.mjs');
const { createProject } = await import('./project-fixture.mjs');

let store;
before(() => { store = openVault(); });
after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });

// Build each pre-gate stage's producer prompt (frame → score → shape → launch), persisting
// a stub artifact between stages so each later prompt sees the accumulated record — exactly
// what the host does with `prompt <stage>` → produce → `save <stage>`.
async function runAndCapture(name, caseTitle = 'Add CSV export', caseText = 'users keep asking to export their data') {
  const p = await createProject(store, name);
  const kase = store.createCase(p.id, caseTitle, caseText, 1);
  const out = { p };
  for (const stage of ['frame', 'score', 'shape', 'launch']) {
    out[stage] = await stagePrompt(store, store.getProject(p.id), store.getCase(kase.id), stage);
    const art = stage === 'score'
      ? '# Score\n\n**Score:** 7\n\nadvance.'
      : `# ${stage[0].toUpperCase() + stage.slice(1)}\n\nStub ${stage} content.`;
    await persistStage(store, store.getProject(p.id), kase.id, stage, art);
  }
  return out;
}

test('Analyst frame prompt: jtbd skill content + the frame template are injected', async () => {
  const { frame } = await runAndCapture('FramePrompt');
  assert.ok(frame, 'frame producer ran');
  assert.match(frame.system, /## Skills/);
  assert.match(frame.system, /Jobs-to-be-Done \(JTBD\)/, 'jtbd skill CONTENT injected from roles/skills/jtbd.md');
  assert.match(frame.system, /### jtbd/, 'skill heading is the file basename');
  assert.match(frame.system, /single table/i, 'frame judges competitors in one table');
  assert.match(frame.system, /at most five, ideally fewer/i, 'frame caps the competitor rows');
  assert.match(frame.system, /Do not propose a solution/i, 'frame stays on the problem');
  assert.match(frame.user, /----- OUTPUT TEMPLATE -----/);
  assert.match(frame.user, /## Problem/, 'frame template has a Problem section');
  assert.match(frame.user, /## Validation/, 'frame template has a Validation section (real quant/qual evidence)');
  assert.match(frame.user, /## Competitive landscape/, 'frame template has a Competitive landscape section');
  assert.doesNotMatch(frame.user, /## Key competitors/, 'no separate key-competitors list');
});

test('Evaluator score prompt: cross-vendor, problem-space rubric, plain language, independent grounding check', async () => {
  const { score } = await runAndCapture('ScorePrompt');
  assert.ok(score, 'score (evaluator) producer ran');
  // Rubric skills — prioritization + win-conditions + the critique (constructive single pass) skill.
  assert.match(score.system, /### prioritization/, 'prioritization skill injected by basename');
  assert.match(score.system, /### win-conditions/, 'win-conditions injected');
  assert.match(score.system, /### critique/, 'the critique skill primes the evaluator (it folds the old critic role)');
  assert.match(score.system, /score the problem, not the solution/i, 'scores the problem, not solution effort');
  assert.match(score.system, /independent, cross-vendor/i, 'score is the decorrelated evaluator');
  assert.match(score.system, /sanity-check the Frame's grounding/i, 'the evaluator also checks the frame is grounded');
  assert.match(score.system, /plain, user-facing language/i, 'writes for a reader who never saw the rubric');
  assert.match(score.system, /never name the internal methodology/i, 'hides the method from the output');
  // Template: score + verdict, no method jargon.
  assert.match(score.user, /Score:.*Verdict/i, 'score template leads with score + verdict');
  assert.match(score.user, /Why now/i, 'score surfaces the one-line why-now (moved here from Launch)');
  assert.doesNotMatch(score.user, /What this is|Risks & weaknesses|What would change the call/i, 'score drops the removed sections');
  assert.doesNotMatch(score.user, /kill-gate/i, 'score template has no gate jargon');
  assert.doesNotMatch(score.user, /weakest-link|multiplier/i, 'score template drops method terms');
});

test('Analyst shape prompt: concept + step-level, surface-native journeys (no go-to-market here)', async () => {
  const { shape } = await runAndCapture('ShapePrompt');
  assert.ok(shape, 'shape producer ran');
  for (const s of ['ux-principles', 'tech-constraints', 'jtbd', 'win-conditions'])
    assert.match(shape.system, new RegExp(`### ${s}`), `${s} skill injected into shape`);
  assert.match(shape.system, /simplest, most user-friendly/i, 'shape iterates toward the simplest design');
  assert.match(shape.system, /primary journey/i, 'shape leads with a canonical primary journey');
  assert.match(shape.system, /step-level/i, 'shape journeys are step-level');
  assert.match(shape.system, /primary surface/i, 'shape journeys run on the product\'s primary surfaces');
  assert.match(shape.system, /only where the flow materially differs/i, 'shape dedupes overlapping personas');
  // Template covers concept → journeys → out of scope, and NO go-to-market (that moved to launch).
  assert.match(shape.user, /## Concept/);
  assert.match(shape.user, /## User journeys/);
  assert.match(shape.user, /## Out of scope/);
  assert.doesNotMatch(shape.user, /## Go-to-market/, 'go-to-market is its own stage now, not in shape');
  assert.doesNotMatch(shape.user, /North Star/, 'metrics live in the launch stage');
});

test('Analyst launch prompt: go-to-market skills + the plain-worded template in one artifact', async () => {
  const { launch } = await runAndCapture('LaunchPrompt');
  assert.ok(launch, 'launch producer ran');
  for (const s of ['jtbd', 'win-conditions'])
    assert.match(launch.system, new RegExp(`### ${s}`), `${s} skill injected into launch`);
  assert.match(launch.system, /do not\s+(?:re-)?judge whether the case should advance/i, 'launch does not re-score viability');
  assert.match(launch.system, /derivable from the\s+telemetry/i, 'launch metrics are telemetry-derived');
  assert.match(launch.system, /invent no new capabilities/i, 'growth loop uses only the concept functionality');
  // Template covers the pitch → first users → phased launch → growth → key metrics.
  assert.match(launch.user, /## Pitch/);
  assert.match(launch.user, /## First users/);
  assert.match(launch.user, /## Launch plan/);
  assert.match(launch.user, /Phase 1 — Hero MVP/);
  assert.match(launch.user, /Phase 2 — Fast follow/);
  assert.match(launch.user, /Phase 3\+ — Later/);
  assert.match(launch.user, /## Growth/);
  assert.match(launch.user, /## Key metrics/);
  assert.doesNotMatch(launch.user, /Why now/i, 'why-now moved to the Score stage — not in Launch');
  assert.match(launch.user, /\*\*Who:\*\*/);
  assert.match(launch.user, /North Star/);
  assert.match(launch.user, /Early signals/i);
  // The launch phases must be grounded in the hero journey + validating the need (not a wishlist).
  assert.match(launch.system, /hero (user )?journey/i, 'phase 1 is grounded in the hero journey');
  assert.match(launch.system, /validate the customer need/i, 'phase 1 validates the customer need');
});

test('the win-conditions skill reaches the Evaluator + Analyst design pass (score, shape)', async () => {
  const { score, shape } = await runAndCapture('WinConds');
  assert.ok(score && shape, 'score and shape both ran');
  for (const [name, call] of [['score', score], ['shape', shape]])
    assert.match(call.system, /### win-conditions/, `win-conditions injected into ${name}`);
});

test('cross-cutting: AGENTS.md golden rules + the no-echo template wrapper reach every stage prompt', async () => {
  const { frame } = await runAndCapture('Golden');
  assert.ok(frame, 'frame ran');
  // The output-template wrapper tells agents not to echo the template's guidance/placeholders.
  assert.match(frame.user, /never echo the template's guidance/i, 'template wrapper forbids echoing placeholder text');
  // …and it is codified as a Golden rule in AGENTS.md, injected into every stage's system prompt.
  assert.match(frame.system, /never reproduce the italic guidance/i, 'AGENTS.md golden rule injected');
  assert.match(frame.system, /Outputs are end-user deliverables/i, 'AGENTS.md golden rule: no run/session/execution meta');
  assert.match(frame.system, /Keep persona descriptions short/i, 'frame keeps personas short');
  assert.match(frame.user, /no biography/i, 'frame template keeps personas to a short phrase');
});

test('project context the host wrote into deliberate/context/product.md reaches every stage prompt', async () => {
  const p = await createProject(store, 'HostCtx');
  // The host writes context as markdown (no engine model); the stage prompts must carry it.
  store.writeContext(p.id, '# HostCtx — project context\n\n## Personas\n\n- indie SaaS founders\n\n## Competitors\n\n- spreadsheets, status quo\n');
  const kase = store.createCase(p.id, 'Add CSV export', 'users keep asking to export their data', 1);
  const frame = await stagePrompt(store, store.getProject(p.id), store.getCase(kase.id), 'frame');
  assert.match(frame.system, /indie SaaS founders/, 'the host-written markdown context reaches the frame prompt');
});
