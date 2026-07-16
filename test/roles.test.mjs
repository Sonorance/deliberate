import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Exercise the real roles/config.yaml; ensure DELIBERATE_MODEL=stub is NOT set so the
// yaml path (not the offline short-circuit) is what gets tested.
delete process.env.DELIBERATE_MODEL;
const realYaml = join(dirname(fileURLToPath(import.meta.url)), '../roles/config.yaml');
const fixtureDir = mkdtempSync(join(tmpdir(), 'dlb-roles-'));
const yaml = join(fixtureDir, 'config.yaml');
const { agentConfig, modelFor, skillsFor } = await import('../src/engine/roles.mjs');
const { CASE_LENS_LABELS } = await import('../src/engine/lenses.mjs');

let original;
before(() => {
  original = readFileSync(realYaml, 'utf8');
  writeFileSync(yaml, original);
});
after(() => { rmSync(fixtureDir, { recursive: true, force: true }); });

test('Case lens labels are lowercase display names', () => {
  assert.deepEqual(Object.values(CASE_LENS_LABELS), [
    'product & experience',
    'market & commercial',
    'strategy & portfolio',
    'platform & ecosystem',
  ]);
});

test('the Analyst stages select the product lens by default', () => {
  const frame = agentConfig('frame');
  assert.equal(frame.model, 'claude-opus-4.8', 'host-run stages inherit the default model (for the headless path)');
  assert.equal(frame.instructions, 'roles/analyst/frame/instructions.md');
  assert.equal(frame.templates.default, 'roles/analyst/frame/output-template-product.md');
  assert.deepEqual(frame.skills, ['roles/skills/case-product.md', 'roles/skills/jtbd.md']);

  const shape = agentConfig('shape');
  assert.equal(shape.instructions, 'roles/analyst/shape/instructions.md');
  assert.deepEqual(shape.skills, ['roles/skills/case-product.md', 'roles/skills/ux-principles.md', 'roles/skills/tech-constraints.md', 'roles/skills/jtbd.md', 'roles/skills/win-conditions.md']);
});

test('all four case lenses select distinct analyst templates and method skills', () => {
  for (const lens of ['product', 'market', 'strategy', 'platform']) {
    for (const stage of ['frame', 'shape', 'launch']) {
      const cfg = agentConfig(stage, undefined, lens);
      assert.equal(cfg.lens, lens);
      assert.equal(cfg.templates.default, `roles/analyst/${stage}/output-template-${lens}.md`);
      assert.ok(cfg.skills.includes(`roles/skills/case-${lens}.md`), `${stage}/${lens} includes its method`);
    }
  }
});

test('score and shape retain their decision-quality safeguards', () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  const score = readFileSync(join(repo, 'roles/evaluator/score/instructions.md'), 'utf8');
  for (const safeguard of [
    /Re-ground independently/,
    /enabling, parity, compliance, and operational work fair credit/,
    /why this should happen now rather than later/,
    /single biggest uncertainty/,
    /objective call without hedging/,
    /plain user-facing language/,
    /do not expose internal criteria/i,
  ]) assert.match(score, safeguard);

  const shape = readFileSync(join(repo, 'roles/analyst/shape/instructions.md'), 'utf8');
  for (const safeguard of [
    /current capabilities/,
    /smallest coherent, generalized solution/,
    /Minimize required inputs, steps, concepts, dependencies, and surface area/,
    /assumption next to the claim it supports/,
    /user's job rather than a feature list/,
    /only the primary product surfaces/,
    /actor, entry point, meaningful actions, system responses, completion state/,
    /internal design objective, not output jargon/,
  ]) assert.match(shape, safeguard);
});

test('non-product launch templates stay concise and table-free while product launch keeps its simple structure', () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  const launchInstructions = readFileSync(join(repo, 'roles/analyst/launch/instructions.md'), 'utf8');
  assert.match(launchInstructions, /only when they materially help execute or test the decision/);
  assert.match(launchInstructions, /Never manufacture precision to fill a template/);
  assert.match(launchInstructions, /short prose or bullets/);

  const expectedSections = {
    market: ['Audience', 'Commitment', 'Proof', 'Sequence', 'Measure', 'Revisit'],
    strategy: ['Direction', 'Commitments', 'Sequence', 'Proof', 'Revisit'],
    platform: ['Decision', 'Boundaries', 'Proof', 'Adoption', 'Measure', 'Revisit'],
  };
  for (const [lens, sections] of Object.entries(expectedSections)) {
    const template = readFileSync(join(repo, `roles/analyst/launch/output-template-${lens}.md`), 'utf8');
    assert.doesNotMatch(template, /^\|/m, `${lens} launch should not force planning tables`);
    assert.ok(template.split('\n').length <= 40, `${lens} launch should remain concise`);
    for (const section of sections) assert.match(template, new RegExp(`^## ${section}$`, 'm'));
  }

  const product = readFileSync(join(repo, 'roles/analyst/launch/output-template-product.md'), 'utf8');
  for (const section of ['Pitch', 'First users', 'Launch plan', 'Growth', 'Key metrics'])
    assert.match(product, new RegExp(`^## ${section}$`, 'm'));
});

test('the Evaluator (score) is a CROSS-VENDOR model under roles/evaluator/, decorrelated from the Analyst', () => {
  assert.equal(modelFor('score'), 'gpt-5.4', 'score runs on a different vendor than the Analyst (claude)');
  assert.notEqual(modelFor('score'), modelFor('frame'), 'evaluator and analyst are different models');
  assert.equal(agentConfig('score').instructions, 'roles/evaluator/score/instructions.md');
  assert.deepEqual(skillsFor('score'), ['roles/skills/case-evaluation.md', 'roles/skills/critique.md', 'roles/skills/case-product.md', 'roles/skills/win-conditions.md'],
    'score combines the common evaluator, critique, and selected product lens method');
});

test('only the Evaluator (score) is a configured model-agent; host-run stages carry no model/effort', () => {
  const LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
  // score is the one isolated cross-vendor sub-agent → it declares a model + effort.
  assert.ok(LEVELS.includes(agentConfig('score').effort), 'the Evaluator declares a valid effort level');
  // frame/shape/prototype run in the host session → no effort/context configured (the host
  // uses its own session model). agentConfig only fills a default MODEL for the headless path.
  assert.equal(agentConfig('frame').effort, null, 'host-run frame carries no effort');
  assert.equal(agentConfig('shape').effort, null, 'host-run shape carries no effort');
  assert.equal(agentConfig('prototype').context, null, 'host-run prototype carries no context tier');
  assert.equal(agentConfig('frame').context, null, 'unset context tier → null');
});

test('the win-conditions skill is shared across the Evaluator + the design stages', () => {
  for (const a of ['score', 'shape', 'launch', 'prototype'])
    assert.ok(skillsFor(a).includes('roles/skills/win-conditions.md'), `${a} applies the win-conditions`);
});

test('the One-pager is a host-run, lens-shaped Analyst sub-job', () => {
  const op = agentConfig('one-pager');
  // Host-run synthesis job: it inherits the default model (no dedicated evaluator model).
  assert.equal(op.model, 'claude-opus-4.8', 'the one-pager is host-run — it inherits the default model');
  assert.equal(op.effort, null, 'host-run one-pager carries no effort');
  assert.equal(op.instructions, 'roles/analyst/one-pager/instructions.md');
  assert.equal(op.templates.default, 'roles/analyst/one-pager/output-template-product.md');
  assert.deepEqual(op.skills, ['roles/skills/case-product.md', 'roles/skills/positioning.md', 'roles/skills/jtbd.md'], 'the product one-pager keeps the customer lens');
  for (const lens of ['market', 'strategy', 'platform']) {
    const typed = agentConfig('one-pager', undefined, lens);
    assert.equal(typed.templates.default, `roles/analyst/one-pager/output-template-${lens}.md`);
    assert.ok(typed.skills.includes(`roles/skills/case-${lens}.md`));
  }
  // It is NOT part of the scored funnel — the stage list stays frame→score→shape→launch→prototype.
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const f of ['instructions.md', 'output-template-product.md'])
    assert.ok(existsSync(join(repo, 'roles/analyst/one-pager', f)), `roles/analyst/one-pager/${f} exists`);
});

test('positioning + metrics are reusable PM-craft skills selected where relevant; landscape-scan is shared by init and brief', () => {
  assert.ok(skillsFor('init').includes('roles/skills/positioning.md'), 'init applies positioning');
  assert.ok(skillsFor('launch').includes('roles/skills/positioning.md'), 'Product launch applies positioning');
  assert.ok(skillsFor('launch', 'market').includes('roles/skills/positioning.md'), 'Market launch applies positioning');
  assert.ok(skillsFor('init').includes('roles/skills/metrics.md'), 'init applies metrics');
  for (const lens of ['product', 'market', 'strategy', 'platform'])
    assert.ok(skillsFor('launch', lens).includes('roles/skills/metrics.md'), `${lens} launch applies metrics`);
  for (const a of ['init', 'brief'])
    assert.ok(skillsFor(a).includes('roles/skills/landscape-scan.md'), `${a} applies the landscape-scan method`);
});

test('the folder is roles/ (by role), not agents/; retired stages + aux agents are gone', () => {
  // agents/ is renamed to roles/ (organized by role: analyst/evaluator/prototyper + skills/).
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  assert.equal(existsSync(join(repo, 'agents')), false, 'the old agents/ folder is gone');
  for (const role of ['analyst', 'evaluator', 'prototyper', 'skills']) assert.ok(existsSync(join(repo, 'roles', role)), `roles/${role}/ exists`);
  // The old 7-stage funnel + critic + build AND the aux model agents (title/describe/contextualize)
  // are removed — titling and context derivation are the host's job, in-session.
  for (const gone of ['understand', 'compete', 'conceptualize', 'critic', 'discover', 'build', 'title', 'describe', 'contextualize']) {
    assert.doesNotMatch(readFileSync(yaml, 'utf8'), new RegExp(`^${gone}:`, 'm'), `no ${gone} block in roles/config.yaml`);
  }
});

test('unknown / removed stages fail instead of fabricating plausible role paths', () => {
  assert.throws(() => agentConfig('does-not-exist'), /Unknown role stage: does-not-exist/);
  assert.throws(() => skillsFor('critic'), /Unknown role stage: critic/);
});

test('editing the yaml changes config on the next invocation (no restart)', () => {
  writeFileSync(yaml, original.replace('gpt-5.4', 'claude-opus-4.8'));   // score (evaluator) model
  assert.equal(agentConfig('score', yaml).model, 'claude-opus-4.8', 'picks up the edited value');
  writeFileSync(yaml, original);
  assert.equal(agentConfig('score', yaml).model, 'gpt-5.4', 'reverts when the file reverts');
});

test('the Briefer (brief) is a HOST-RUN role under roles/briefer/, with the landscape-scan skill', () => {
  const brief = agentConfig('brief');
  assert.equal(brief.model, 'claude-opus-4.8', 'host-run: inherits the default model (no per-role model)');
  assert.equal(brief.effort, null, 'host-run: no effort configured (the host uses its own session model)');
  assert.equal(brief.context, null, 'host-run: no context tier');
  assert.equal(brief.instructions, 'roles/briefer/brief/instructions.md');
  assert.equal(brief.templates.default, 'roles/briefer/brief/output-template.md');
  assert.deepEqual(brief.skills, ['roles/skills/landscape-scan.md'], 'the Briefer applies the landscape-scan method');
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  assert.ok(existsSync(join(repo, 'roles', 'briefer', 'brief', 'instructions.md')), 'the Briefer playbook exists');
  assert.ok(existsSync(join(repo, 'roles', 'skills', 'landscape-scan.md')), 'the landscape-scan skill exists');
});

test('the Initiator (init) is a HOST-RUN role under roles/initiator/, with two output templates (product + competitors, no default)', () => {
  const init = agentConfig('init');
  assert.equal(init.model, 'claude-opus-4.8', 'host-run: inherits the default model (no per-role model)');
  assert.equal(init.effort, null, 'host-run: no effort configured');
  assert.equal(init.instructions, 'roles/initiator/init/instructions.md');
  assert.deepEqual(init.skills, ['roles/skills/jtbd.md', 'roles/skills/landscape-scan.md', 'roles/skills/positioning.md', 'roles/skills/metrics.md'],
    'the Initiator applies jtbd (personas/jobs), landscape-scan (competitors/market), positioning (value prop), and metrics');
  // init has THREE output templates (declared in config.yaml), and NO `default`.
  assert.equal(init.templates.product, 'roles/initiator/init/output-template-product.md');
  assert.equal(init.templates.competitors, 'roles/initiator/init/output-template-competitors.md');
  assert.equal(init.templates.ecosystem, 'roles/initiator/init/output-template-ecosystem.md');
  assert.equal(init.templates.default, undefined, 'init declares product + competitors + ecosystem, not a `default`');
  assert.equal(init.templates.full, undefined, 'the legacy `full` key is gone');
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const f of ['instructions.md', 'output-template-product.md', 'output-template-competitors.md', 'output-template-ecosystem.md'])
    assert.ok(existsSync(join(repo, 'roles', 'initiator', 'init', f)), `roles/initiator/init/${f} exists (method + its three output templates)`);
  assert.equal(existsSync(join(repo, 'roles', 'context')), false, 'the interim roles/context/ folder is gone (templates co-located with the role)');
});

test('resolved templates expose one `default` output after lens selection', () => {
  for (const stage of ['frame', 'score', 'shape', 'launch', 'prototype', 'brief', 'one-pager']) {
    const t = agentConfig(stage).templates;
    assert.ok(t.default && /output-template(?:-[a-z]+)?\.md$/.test(t.default), `${stage} declares a resolved templates.default`);
    assert.equal(t.full, undefined, `${stage} no longer uses the legacy templates.full`);
  }
});

test('malformed role config fails clearly instead of silently generating fallback prompts', () => {
  try {
    writeFileSync(yaml, 'frame:\n  this is not yaml\n');
    assert.throws(() => agentConfig('frame', yaml), /Invalid roles\/config\.yaml at line 2: expected key: value/);
    writeFileSync(yaml, original.replace('roles/analyst/frame/instructions.md', '"roles/analyst/frame/instructions.md'));
    assert.throws(() => agentConfig('frame', yaml), /Invalid roles\/config\.yaml at line \d+: unbalanced quoted value/);
  } finally {
    writeFileSync(yaml, original);
  }
});

test('known stages require complete bindings to existing files', () => {
  try {
    writeFileSync(yaml, original.replace('  instructions: roles/analyst/frame/instructions.md\n', ''));
    assert.throws(() => agentConfig('frame', yaml), /"frame\.instructions" is required/);
    writeFileSync(yaml, original.replace('roles/analyst/frame/instructions.md', 'roles/analyst/frame/missing.md'));
    assert.throws(() => agentConfig('frame', yaml), /"frame\.instructions" must reference an existing file/);
    writeFileSync(yaml, original.replace('  instructions: roles/evaluator/score/instructions.md\n', ''));
    assert.throws(() => agentConfig('frame', yaml), /"score\.instructions" is required/, 'the entire known-stage contract is validated, not just the requested stage');
    writeFileSync(yaml, original.replace('    product:    roles/analyst/frame/output-template-product.md', '    typo:       roles/analyst/frame/output-template-product.md'));
    assert.throws(() => agentConfig('frame', yaml), /unexpected "frame\.templates\.typo"/);
    writeFileSync(yaml, original.replace('    product:     roles/initiator/init/output-template-product.md\n', ''));
    assert.throws(() => agentConfig('init', yaml), /"init\.templates\.product" is required/);
    writeFileSync(yaml, original.replace('  model:        gpt-5.4\n', ''));
    assert.throws(() => agentConfig('score', yaml), /"score\.model" is required/);
    writeFileSync(yaml, original.replace('  reasoning_effort: high', '  reasoning_effort: bananas'));
    assert.throws(() => agentConfig('score', yaml), /"score\.reasoning_effort" is invalid/);
    writeFileSync(yaml, original.replace('  skills: []\n', '  model: gpt-5.4\n  skills: []\n'));
    assert.throws(() => agentConfig('frame', yaml), /unexpected "frame\.model"/);
    writeFileSync(yaml, original.replace('    strategy: [roles/skills/case-strategy.md]\n', ''));
    assert.throws(() => agentConfig('frame', yaml), /"frame\.lens_skills\.strategy" must be a list/);
  } finally {
    writeFileSync(yaml, original);
  }
});

test('prototype is available only for product and market cases', () => {
  assert.equal(agentConfig('prototype', undefined, 'product').templates.default, 'roles/prototyper/prototype/output-template-product.md');
  assert.equal(agentConfig('prototype', undefined, 'market').templates.default, 'roles/prototyper/prototype/output-template-market.md');
  assert.ok(skillsFor('prototype', 'market').includes('roles/skills/ux-principles.md'), 'market touchpoints retain experience-quality guidance');
  assert.ok(skillsFor('prototype', 'market').includes('roles/skills/jtbd.md'), 'market touchpoints stay grounded in the customer job');
  assert.throws(() => agentConfig('prototype', undefined, 'strategy'), /not available for strategy cases/);
  assert.throws(() => agentConfig('prototype', undefined, 'platform'), /not available for platform cases/);
});
