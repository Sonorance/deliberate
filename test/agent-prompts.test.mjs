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
const { stagePrompt, persistStage, scorePrompt, onepagerPrompt, prototypePrompt } = await import('../src/engine/service.mjs');
const { createProject } = await import('./project-fixture.mjs');

let store;
before(() => { store = openVault(); });
after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });

// Build each analysis prompt, persisting a stub artifact between stages, then build the
// completed case's score prompt.
async function runAndCapture(name, caseTitle = 'Add CSV export', caseText = 'users keep asking to export their data', lens = 'product') {
  const p = await createProject(store, name);
  const kase = store.createCase(p.id, caseTitle, caseText, { lens });
  const out = { p };
  for (const stage of ['frame', 'shape', 'launch']) {
    out[stage] = await stagePrompt(store, store.getProject(p.id), store.getCase(kase.id), stage);
    const art = `# ${stage[0].toUpperCase() + stage.slice(1)}\n\nStub ${stage} content.`;
    await persistStage(store, store.getProject(p.id), kase.id, stage, art);
  }
  const completed = store.getCase(kase.id);
  out.score = await scorePrompt(store, store.getProject(p.id), completed);
  out.onepager = await onepagerPrompt(store, store.getProject(p.id), completed);
  out.kase = completed;
  return out;
}

test('Analyst frame prompt: jtbd skill content + the frame template are injected', async () => {
  const { frame } = await runAndCapture('FramePrompt');
  assert.ok(frame, 'frame producer ran');
  assert.match(frame.system, /## Skills/);
  assert.match(frame.system, /Jobs-to-be-Done \(JTBD\)/, 'jtbd skill CONTENT injected from roles/skills/jtbd.md');
  assert.match(frame.system, /### jtbd/, 'skill heading is the file basename');
  assert.match(frame.system, /product & experience case/, 'the product lens method is injected');
  assert.match(frame.system, /without recommending an answer yet/i, 'frame does not choose the answer');
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
  assert.match(score.system, /### case-evaluation/, 'common case evaluator injected');
  assert.match(score.system, /### case-product/, 'product evaluation method injected');
  assert.match(score.system, /### win-conditions/, 'win-conditions injected');
  assert.match(score.system, /### critique/, 'the critique skill primes the evaluator (it folds the old critic role)');
  assert.match(score.system, /isolated[\s\S]{0,80}cross-vendor/i, 'score is the decorrelated evaluator');
  assert.match(score.system, /Re-ground independently before accepting the recommendation/i, 'the evaluator reaches an independent grounding judgment');
  assert.match(score.system, /enabling, parity, compliance, and operational work fair credit/i, 'the evaluator does not dismiss necessary enabling work');
  assert.match(score.system, /why this should happen now rather than later/i, 'the evaluator tests why now');
  assert.match(score.system, /single biggest uncertainty/i, 'the evaluator names the uncertainty most likely to change the call');
  assert.match(score.system, /objective call without hedging/i, 'the evaluator must make a clear judgment');
  assert.match(score.system, /plain user-facing language/i, 'the evaluator keeps scoring mechanics out of the recommendation');
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
  assert.match(shape.system, /simplest coherent concept/i, 'the product method shapes the simplest concept');
  assert.match(shape.system, /primary journey/i, 'shape leads with a canonical primary journey');
  assert.match(shape.system, /step-level/i, 'shape journeys are step-level');
  assert.match(shape.system, /primary surface/i, 'shape journeys run on the product\'s primary surfaces');
  assert.match(shape.system, /only where the flow materially differs/i, 'shape dedupes overlapping personas');
  assert.match(shape.system, /current capabilities/i, 'shape stays grounded in what exists now');
  assert.match(shape.system, /smallest coherent, generalized solution/i, 'shape iterates toward the smallest generalized answer');
  assert.match(shape.system, /Minimize required inputs, steps, concepts, dependencies, and surface area/i, 'shape resists unnecessary interaction and scope');
  assert.match(shape.system, /user's job rather than a feature list/i, 'product shape organizes around the job');
  assert.match(shape.system, /actor, entry point, meaningful actions, system responses, completion state/i, 'the primary journey is concrete enough to prototype');
  assert.match(shape.system, /internal design objective, not output jargon/i, 'delight informs the design without leaking methodology language');
  // Template covers alternatives → recommendation/concept → journeys → out of scope, and NO go-to-market.
  assert.match(shape.user, /## Alternatives/);
  assert.match(shape.user, /Status quo/);
  assert.match(shape.user, /Main tradeoff/);
  assert.match(shape.user, /## Concept/);
  assert.match(shape.user, /Decisive assumptions/);
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
  assert.match(launch.system, /without expanding its scope or re-judging it/i, 'launch does not re-score viability');
  assert.match(launch.system, /only when they materially help execute or test the decision/i, 'launch includes analytical detail selectively');
  assert.match(launch.system, /Never manufacture precision to fill a template/i, 'launch does not force fake targets or owners');
  assert.match(launch.system, /short prose or bullets/i, 'launch stays concise and actionable');
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
  assert.match(launch.system, /validates? the customer need/i, 'phase 1 validates the customer need');
});

test('product prototype prompt preserves complete native-medium journey and artifact quality safeguards', async () => {
  const out = await runAndCapture('ProductPrototype');
  const prototype = await prototypePrompt(store, out.p, out.kase);
  for (const [pattern, message] of [
    [/connected product sources before writing/i, 'inspects the real product first'],
    [/implementation or design skills/i, 'follows repository implementation skills'],
    [/real command grammar[\s\S]*--help[\s\S]*exit codes/i, 'defines a concrete CLI medium'],
    [/worked request → response pairs[\s\S]*error envelope/i, 'defines a concrete API medium'],
    [/every shaped step reachable in order/i, 'walks the exact shaped journey'],
    [/failure, empty, uncertainty, or recovery path/i, 'includes the important non-happy path'],
    [/every step visibly serve a job-to-be-done/i, 'traces interactions to the job'],
    [/static snapshot, partial journey, written description, generic CRUD mock/i, 'rejects shallow prototypes'],
    [/file:\/\/[\s\S]*no build, backend, external asset, or network call/i, 'keeps the artifact self-contained'],
    [/keyboard focus is visible[\s\S]*reduced-motion preferences/i, 'keeps visual prototypes usable'],
  ]) assert.match(prototype.system, pattern, message);
  assert.match(prototype.user, /## Journey coverage/);
  assert.match(prototype.user, /Reachable interaction and resulting state/);
  assert.match(prototype.user, /## Grounding and fidelity/);
  assert.match(prototype.user, /## What to evaluate/);
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

test('all three project context files reach every stage prompt', async () => {
  const p = await createProject(store, 'HostCtx');
  // The host writes context as markdown (no engine model); the stage prompts must carry it.
  store.writeContext(p.id, '# HostCtx — project context\n\n## Personas\n\n- indie SaaS founders\n\n## Competitors\n\nSee [competitors.md](./competitors.md).\n');
  store.writeCompetitors(p.id, '# Competitors\n\n## SheetCo\n\n- **Overlap:** spreadsheets, status quo\n');
  store.writeEcosystem(p.id, '# Ecosystem\n\n## RuntimeCo — Dependency, current\n');
  const kase = store.createCase(p.id, 'Add CSV export', 'users keep asking to export their data', 1);
  const frame = await stagePrompt(store, store.getProject(p.id), store.getCase(kase.id), 'frame');
  assert.match(frame.system, /indie SaaS founders/, 'the host-written markdown context reaches the frame prompt');
  assert.match(frame.system, /SheetCo/, 'the canonical competitor context reaches the frame prompt');
  assert.match(frame.system, /RuntimeCo/, 'the canonical ecosystem context reaches the frame prompt');
});

test('Case lenses select distinct concise prompts, one-pagers, and prototype eligibility', async () => {
  const scenarios = [
    ['market', 'Reposition for enterprise teams', /## Recommended market shape/, /# _?market decision_?/, /## Audience[\s\S]*## Commitment[\s\S]*## Proof[\s\S]*## Sequence[\s\S]*## Measure[\s\S]*## Revisit/, true],
    ['strategy', 'Choose the next market to enter', /## Strategic options/, /# _?strategy decision_?/, /## Direction[\s\S]*## Commitments[\s\S]*## Sequence[\s\S]*## Proof[\s\S]*## Revisit/, false],
    ['platform', 'Adopt a shared agent protocol', /## Options/, /# _?platform decision_?/, /## Decision[\s\S]*## Boundaries[\s\S]*## Proof[\s\S]*## Adoption[\s\S]*## Measure[\s\S]*## Revisit/, false],
  ];
  for (const [lens, title, shapeTemplate, onepagerTemplate, launchTemplate, prototypeEligible] of scenarios) {
    const out = await runAndCapture(`Lens-${lens}`, title, title, lens);
    assert.match(out.frame.user, new RegExp(`Decision lens\\n${lens === 'market' ? 'market & commercial' : lens === 'strategy' ? 'strategy & portfolio' : 'platform & ecosystem'}`));
    assert.match(out.shape.user, shapeTemplate, `${lens} Shape template selected`);
    assert.match(out.launch.user, launchTemplate, `${lens} concise Launch template selected`);
    assert.doesNotMatch(out.launch.user, /\|---/, `${lens} Launch avoids table-driven planning`);
    assert.match(out.onepager.user, onepagerTemplate, `${lens} one-pager template selected`);
    if (prototypeEligible) {
      const proto = await prototypePrompt(store, out.p, out.kase);
      assert.match(proto.system, /one decisive market hypothesis/i);
      assert.match(proto.system, /audience, context, claim, grounded proof, action, and observable response/i);
      assert.match(proto.system, /meaningful objection, alternate response, or failure state/i);
      assert.match(proto.system, /do not fabricate customer logos, testimonials, prices, outcomes/i);
      assert.match(proto.user, /## Test path/);
      assert.match(proto.user, /## Grounding and fidelity/);
      assert.match(proto.user, /## Decision signal/);
    } else {
      await assert.rejects(() => prototypePrompt(store, out.p, out.kase), /Prototype is not available/);
    }
  }
});
