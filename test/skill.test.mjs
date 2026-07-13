import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const home = mkdtempSync(join(tmpdir(), 'dlb-skill-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';
after(() => rmSync(home, { recursive: true, force: true }));

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repoRoot, 'src/cli/deliberate.mjs');
const runIn = (cwd, env, ...args) => execFileSync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
const { installEngineConfig } = await import('../src/cli/deliberate.mjs');

test('packaged installs pin the npm version instead of an expendable npx-cache path', () => {
  const packagedRoot = mkdtempSync(join(tmpdir(), 'dlb-packaged-'));
  try {
    assert.deepEqual(installEngineConfig(packagedRoot, '/tmp/cache/src/cli/deliberate.mjs', '1.2.3'), {
      package: 'deliberate-cli',
      version: '1.2.3',
    });
    assert.deepEqual(installEngineConfig(repoRoot, cli, '1.2.3'), { engine: cli }, 'source checkouts keep their local development engine');
  } finally {
    rmSync(packagedRoot, { recursive: true, force: true });
  }
});

test('SKILL.md has strictly-valid, user-invocable Copilot frontmatter for `deliberate`', () => {
  const raw = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, 'has a --- frontmatter block');
  // Parse with a STRICT YAML parser (what GitHub Copilot uses) — a bare `: ` or an
  // unquoted inner quote in the description would throw here, as it did in the wild.
  const data = yaml.load(m[1]);
  const body = m[2];
  assert.equal(data.name, 'deliberate', 'skill name is the command handle');
  assert.equal(data['user-invocable'], true, 'exposed as a /deliberate command');
  assert.ok(String(data.description).length > 40, 'has a routing description');
  assert.ok(String(data.description).length <= 1024, 'description stays within Copilot skill discovery’s 1024-character limit');
  assert.ok(data['argument-hint'], 'has an argument hint');
  assert.match(body, /`init`/, 'documents the init command');
  assert.match(body, /`case <idea>`/, 'documents the case command');
  assert.match(body, /asked for, never automatic/i, 'preserves the prototype-ask rule (built on request, not automatic)');
});

test('the Initiator deduces real competitors (never empty); SKILL.md orchestrates + confirms them', () => {
  const instr = readFileSync(join(repoRoot, 'roles/initiator/init/instructions.md'), 'utf8').replace(/\s+/g, ' ');
  const skill = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8').replace(/\s+/g, ' ');
  // Method (the role): deduce the REAL competitors; that's research, not fabrication.
  assert.match(instr, /real, named.*competitors|competitors.*real, named/i, 'the method deduces the real, named competitors');
  assert.match(instr, /research, not fabrication/i, 'deducing real competitors is research, not fabrication');
  // Orchestration (SKILL.md): the guardrails + the confirm step stay in the playbook.
  assert.match(skill, /research, not fabrication/i, 'SKILL.md keeps the research-not-fabrication guardrail');
  assert.match(skill, /[Nn]ever leave [Cc]ompetitors empty/, 'SKILL.md keeps never-leave-empty');
  assert.match(skill, /deduced competitors/i, 'the confirm step shows the deduced competitors');
  assert.match(skill, /readout cadence\/alignment\/timezone/i, 'the confirm step shows the report-level period contract');
  assert.match(instr, /readout cadence\/alignment\/timezone/i, 'the Initiator asks the user to confirm the period contract');
  assert.match(skill, /confirm\/correct/i, 'the host asks the user to confirm/correct them');
});

test('SKILL.md `init` is thin orchestration that defers the method to `init prompt` (the Initiator role)', () => {
  const skill = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8');
  assert.match(skill, /LAUNCHER init prompt/, 'init orchestration fetches the method via `init prompt`');
  assert.match(skill, /Initiator/, 'names the Initiator role');
});

test('`deliberate init` sets up the CURRENT folder: context under deliberate/context/, cases under deliberate/', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-userrepo-'));
  const out = runIn(repo, {}, 'init');
  assert.match(out, /initialized/i);
  assert.ok(existsSync(join(repo, 'deliberate', 'context', 'product.md')), 'the context lives at deliberate/context/product.md');
  // Competitors must be auto-deduced, never left empty (the scaffold instructs the host).
  const prod = readFileSync(join(repo, 'deliberate', 'context', 'product.md'), 'utf8');
  assert.match(prod, /Identify several .*competitors/i, 'the scaffold tells the host to deduce several competitors');
  assert.match(prod, /[Nn]ever leave this\s+empty/, 'the scaffold forbids leaving Competitors empty');
  assert.ok(existsSync(join(repo, '.sonorance', 'config.json')), 'platform config under the hidden .sonorance/');
  // The repo is now the current project and a case lands under deliberate/cases/<YYYY-MM-DD-slug>/.
  runIn(repo, {}, 'case', 'Bulk archive stale mail');
  const artFile = join(repo, 'score-input.md');
  writeFileSync(artFile, '# Score\n\n**Score:** 7\n\nadvance.');
  runIn(repo, {}, 'case', 'score', 'save', '--model', 'gpt-5.4', '--independent', '--file', artFile);
  const casesRoot = join(repo, 'deliberate', 'cases');
  const folder = readdirSync(casesRoot).find(d => d.startsWith('20') && d.includes('bulk-archive'));
  assert.match(folder, /^\d{4}-\d{2}-\d{2}-bulk-archive-stale$/, 'case folder is YYYY-MM-DD-slug (no number; slug ≤ 5 words / 20 chars)');
  const caseDir = join(casesRoot, folder);
  assert.ok(!existsSync(join(caseDir, 'case.md')), 'no separate case.md — the case IS its analysis.md');
  const record = join(caseDir, 'analysis.md');
  assert.ok(existsSync(record), 'one combined decision record: analysis.md');
  assert.ok(existsSync(join(caseDir, 'score.md')), 'the decorrelated score is its own recomputable companion (score.md)');
  assert.match(readFileSync(record, 'utf8'), /## Score[\s\S]*score\.md/, 'the record links the score companion');
  rmSync(repo, { recursive: true, force: true });
});

test('`deliberate install` installs a working /deliberate into ~/.copilot/skills with the engine baked in', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'dlb-home-'));
  const out = runIn(repoRoot, { HOME: fakeHome, USERPROFILE: fakeHome }, 'install');
  const dest = join(fakeHome, '.copilot', 'skills', 'deliberate');
  assert.match(out, /installed the \/deliberate skill/i);
  assert.ok(existsSync(join(dest, 'SKILL.md')), 'SKILL.md copied');
  assert.ok(existsSync(join(dest, 'scripts', 'deliberate.mjs')), 'launcher copied');
  // The engine path is baked so the global skill points back at this checkout.
  const eng = JSON.parse(readFileSync(join(dest, 'scripts', 'engine.json'), 'utf8')).engine;
  assert.equal(eng, cli, 'engine.json points at this checkout');
  // The SKILL.md launcher reference was rewritten to the absolute installed path.
  assert.match(readFileSync(join(dest, 'SKILL.md'), 'utf8'), new RegExp(dest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/scripts/deliberate.mjs'), 'launcher path is absolute in the installed skill');

  // The installed launcher resolves the engine (via engine.json) and forwards args
  // from any cwd — here, a fresh repo gets initialized by the installed skill's launcher.
  const userRepo = mkdtempSync(join(tmpdir(), 'dlb-viaskill-'));
  const launcher = join(dest, 'scripts', 'deliberate.mjs');
  const initOut = execFileSync(process.execPath, [launcher, 'init', 'ViaSkill'], { cwd: userRepo, env: process.env, encoding: 'utf8' });
  assert.match(initOut, /initialized/i, 'the installed launcher runs the engine');
  assert.ok(existsSync(join(userRepo, 'deliberate', 'context', 'product.md')), 'launcher forwarded cwd → context created in the user repo');
  rmSync(userRepo, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
});

test('`deliberate install --project <dir>` installs into a repo\'s .github/skills (not global)', () => {
  const target = mkdtempSync(join(tmpdir(), 'dlb-target-'));
  const out = runIn(repoRoot, {}, 'install', '--project', target).replace(/\x1B\[[0-9;]*m/g, '');
  const dest = join(target, '.github', 'skills', 'deliberate');
  assert.match(out, /installed the \/deliberate skill \(project\)/i);
  assert.ok(existsSync(join(dest, 'SKILL.md')) && existsSync(join(dest, 'scripts', 'deliberate.mjs')), 'skill written under <repo>/.github/skills/deliberate');
  assert.equal(JSON.parse(readFileSync(join(dest, 'scripts', 'engine.json'), 'utf8')).engine, cli, 'engine.json points at this checkout');
  // Project install keeps the launcher reference RELATIVE (Copilot runs from that repo root).
  assert.match(readFileSync(join(dest, 'SKILL.md'), 'utf8'), /node \.github\/skills\/deliberate\/scripts\/deliberate\.mjs/, 'launcher path stays repo-relative');
  // The installed launcher runs the engine against that repo.
  const initOut = execFileSync(process.execPath, [join(dest, 'scripts', 'deliberate.mjs'), 'init', 'Target'], { cwd: target, env: process.env, encoding: 'utf8' });
  assert.match(initOut, /initialized/i);
  assert.ok(existsSync(join(target, 'deliberate', 'context', 'product.md')), 'the repo-scoped skill sets up that repo');
  rmSync(target, { recursive: true, force: true });
});

test('SKILL.md documents the one-pager: the `case` flow generates it, and `address` keeps both docs consistent', () => {
  const body = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8');
  // The `case` flow writes it as part of every case (not a re-triggerable stage).
  assert.match(body, /one-pager/i, 'SKILL.md documents the one-pager');
  assert.match(body, /case one-pager prompt/, 'documents the one-pager prompt step');
  assert.match(body, /case one-pager save/, 'documents the one-pager save step');
  assert.match(body, /one-pager\.md/, 'names the on-disk companion file');
  assert.match(body, /reverse PR-FAQ/i, 'frames the one-pager as an internal reverse PR-FAQ');
  // The address flow must revise BOTH the analysis and the one-pager when one invalidates the other.
  const address = body.slice(body.indexOf('## `address`'));
  assert.match(address, /consistent/i, 'address keeps the case\u2019s two documents consistent');
  assert.match(address, /one-pager/i, 'address covers the one-pager, not just analysis.md');
  assert.match(address, /regenerate/i, 'address regenerates the one-pager after a material analysis change');
});

test('SKILL.md documents the `brief` command: the Briefer flow, the 3-month window, and sourced filtering', () => {
  const body = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8');
  assert.match(body, /##\s+`brief`/, 'there is a brief section');
  assert.match(body, /Briefer/, 'names the Briefer role');
  assert.match(body, /since the last brief/i, 'frames the window as since the last brief');
  assert.match(body, /3 months/, 'caps the look-back at 3 months');
  assert.match(body, /brief prompt/, 'documents the brief prompt step');
  assert.match(body, /brief save/, 'documents the brief save step');
  assert.match(body, /source link|Source/, 'requires source links for findings');
  assert.match(body, /No meaningful updates/, 'a quiet competitor is reported as no meaningful updates');
  assert.match(body, /\bbriefs\b/, 'mentions the briefs list command');
});

test('SKILL.md `readout` grounds all analysis in one completed, overridable reporting period', () => {
  const body = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8');
  const readout = body.slice(body.indexOf('## `readout [period]`'), body.indexOf('## `matchup`'));
  assert.match(readout, /previous completed Monday–Sunday calendar week/i, 'defaults to a completed calendar week');
  assert.match(readout, /natural-language override.*for June.*for Q2/is, 'accepts natural-language completed-period overrides');
  assert.match(readout, /If the requested period is ambiguous or still in progress, ask for clarification/i, 'rejects ambiguous or incomplete overrides');
  assert.match(readout, /Metrics, customer evidence, releases, experiments, incidents, Key takeaways, Insights, and Actions must use only evidence inside the report-level period/i, 'one period grounds every analysis layer');
  assert.match(readout, /metric table needs only \*\*Metric · Value · Comparison · Read\*\*/i, 'does not repeat the report-level period per metric');
  assert.match(readout, /Use the exact same dates and timezone as `prompt`/i, 'prompt and save persist the same period contract');
  assert.match(readout, /save rejects a mismatched `Period:` line/i, 'the artifact cannot drift from its persisted period metadata');
});

test('SKILL.md requires workflow-specific, default-positive follow-up CTAs', () => {
  const body = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8');
  const routing = body.slice(body.indexOf('Every substantive workflow'), body.indexOf('## `init`'));
  for (const next of ['`init` → run the first brief', '`brief` → run the recommended Cases', '`case` → build the prototype', '`prototype` → open it for review', '`readout` → run the recommended Cases', '`matchup` → run a fresh brief', '`source add|remove` → refresh affected project context', '`address` → review the resolved changes in Diff mode'])
    assert.match(routing, new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `documents the ${next} handoff`);
  assert.match(routing, /default yes/g, 'substantive CTAs are default-positive');

  const init = body.slice(body.indexOf('## `init`'), body.indexOf('## `case <idea>`'));
  assert.match(init, /Run the first landscape brief now\?/i, 'init asks to run a Brief');
  assert.match(init, /\*\*Run brief\*\* \(default\)/, 'running the Brief is the default');
  assert.doesNotMatch(init, /Run (?:the first |a )?Case now\?/i, 'init does not bypass the hero Brief by recommending a Case');

  const brief = body.slice(body.indexOf('## `brief`'), body.indexOf('## `readout [period]`'));
  assert.match(brief, /triggering signal and evidence/i, 'recommended Cases preserve their motivating evidence');
  assert.match(brief, /why analy(?:sis|zing it) is valuable now/i, 'recommended Cases explain the value of analysis');
  assert.match(brief, /decision.*unlock/i, 'recommended Cases name the decision they unlock');
  assert.match(brief, /Run recommended Cases.*default/is, 'running recommended Cases is the default Brief CTA');
});

test('the Initiator role grounds the brief: Ecosystem + Market + per-competitor, change-oriented sources', () => {
  const instr = readFileSync(join(repoRoot, 'roles/initiator/init/instructions.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(instr, /\bEcosystem\b/, 'the method writes an Ecosystem players section');
  assert.match(instr, /\bMarket\b/, 'the method writes a Market section');
  assert.match(instr, /standards? & protocols/i, 'names standards & protocols to watch');
  assert.match(instr, /dependency \/ complement \/ channel \/ mover|Dependency.*Complement.*Channel.*Mover/i, 'classifies ecosystem players by position');
  assert.match(instr, /current.*potential|potential.*current/i, 'ecosystem players carry a current/potential status');
  assert.match(instr, /per competitor/i, 'competitors.md sources are per competitor, not a fixed total');
  assert.match(instr, /per player|each ecosystem player/i, 'ecosystem.md sources are per player');
  assert.match(instr, /detecting what they ship|change-detection/i, 'the sources are change-detection oriented');
  assert.match(instr, /\/deliberate brief|landscape brief/i, 'states these ground the brief');
});

test('the Initiator role documents the commercial grounding sections + the never-guess missing-source behavior', () => {
  const instr = readFileSync(join(repoRoot, 'roles/initiator/init/instructions.md'), 'utf8').replace(/\s+/g, ' ');
  for (const section of ['Value proposition & positioning', 'Business model & pricing', 'Distribution & channels', 'Metrics & traction'])
    assert.ok(instr.includes(section), `the method lists the "${section}" section`);
  assert.match(instr, /future PM \/ exec \/ marketing/i, 'notes the context grounds future PM/exec/marketing work');
  assert.match(instr, /never guess|do not invent/i, 'tells the host not to guess missing info');
  assert.match(instr, /add a source|provide the details/i, 'tells the host to ask for a source or manual input');
  assert.match(instr, /Not covered by the provided sources/, 'defines the explicit missing-source marker');
});

test('init records one durable readout period contract, never snapshot baselines or targets', () => {
  const instr = readFileSync(join(repoRoot, 'roles/initiator/init/instructions.md'), 'utf8');
  const template = readFileSync(join(repoRoot, 'roles/initiator/init/output-template-product.md'), 'utf8');
  const metrics = readFileSync(join(repoRoot, 'roles/skills/metrics.md'), 'utf8');
  for (const text of [instr, template, metrics]) {
    assert.match(text, /calendar week/i);
    assert.match(text, /timezone/i);
    assert.match(text, /immediately preceding equivalent completed period/i);
  }
  assert.doesNotMatch(template, /current baseline\/date|target\/date/i, 'the scaffold has no volatile value slots');
  assert.match(template, /Do not copy current values, dated baselines, targets/i);
  assert.match(metrics, /previous readout artifact is never the metric baseline/i);
});

test('SKILL.md `init` discovers the project\'s OWN sources section by section, with a complete default-accept confirmation', () => {
  const skill = readFileSync(join(repoRoot, 'skill/SKILL.md'), 'utf8');
  const step2 = skill.slice(skill.indexOf('## `init`'), skill.indexOf('## `case <idea>`'));
  assert.match(step2, /source add/, 'still collects the user\u2019s manual sources via `source add`');
  assert.match(step2, /Discover by section, not as one undifferentiated pile/i, 'discovery begins with the grounding sections, not a generic source pile');
  for (const section of ['product-strategy', 'code-delivery', 'metrics-data', 'customer-voice', 'go-to-market'])
    assert.match(step2, new RegExp(section), `actively covers ${section}`);
  assert.match(step2, /at least three distinct, high-signal sources per section when they genuinely exist/i, 'seeks meaningful section depth without a hard quota');
  assert.match(step2, /accept fewer when they are more authoritative/i, 'allows fewer stronger sources');
  assert.match(step2, /never pad a quota/i, 'forbids noisy quota padding');
  assert.match(step2, /first-party/i, 'applies the first-party source discipline');
  assert.match(step2, /Confirm before adding/i, 'has a confirmation gate before adding discovered sources');
  assert.match(step2, /every auto-discovered candidate/i, 'shows the complete candidate list');
  assert.match(step2, /- <location> - <source description>/, 'uses the exact readable source bullet shape');
  assert.match(step2, /Do not collapse the list into counts or prose/i, 'forbids incomplete summary-only confirmation');
  assert.match(step2, /alongside the manual sources/i, 'option: add alongside the manual sources');
  assert.match(step2, /keep only the ones they gave/i, 'option: keep only the manual sources');
  assert.match(step2, /change the list/i, 'option: change the proposed list');
  assert.match(step2, /never drop or overwrite/i, 'the manual sources are never dropped');
  assert.match(step2, /Public GitHub Issues are customer voice/i, 'public product-owned Issues are considered as customer evidence');
  assert.match(step2, /verify whether it is publicly accessible and Issues are enabled/i, 'Issues inclusion requires verification');
});

test('the Initiator method defines section-led discovery and strategic ecosystem curation', () => {
  const instr = readFileSync(join(repoRoot, 'roles/initiator/init/instructions.md'), 'utf8');
  const sec = instr.slice(instr.indexOf('### `.sonorance/sources.md`'));
  assert.ok(sec.length > 0, 'the method has a dedicated .sonorance/sources.md section');
  assert.match(sec, /discover section by section/i, 'sources are sought for each decision section');
  assert.match(sec, /Do not detect one generic pile/i, 'generic discovery-then-bucketing is forbidden');
  assert.match(sec, /prefer at least three distinct high-signal sources when they genuinely exist/i, 'prefers useful depth');
  assert.match(sec, /keep fewer when they are more authoritative/i, 'authority wins over quotas');
  assert.match(sec, /- <location> - <source description>/, 'confirmation lists every source in the exact required shape');
  assert.match(sec, /Public Issues page.*customer-voice/i, 'verified public GitHub Issues become Customer Voice');
  assert.match(sec, /never drop or overwrite/i, 'the manual sources are never dropped');

  const ecosystem = instr.slice(instr.indexOf('- **Ecosystem:** catalogue'), instr.indexOf('### `competitors.md`'));
  assert.match(ecosystem, /strategically material named players/i, 'the ecosystem is strategic rather than exhaustive');
  assert.match(ecosystem, /news.*could plausibly trigger an actionable product or business decision/is, 'inclusion is governed by decision relevance');
  assert.match(ecosystem, /do not copy the manifest into the roster/i, 'dependency manifests are evidence, not a roster');
  assert.match(ecosystem, /exclude ordinary libraries, utilities, transitive packages/i, 'implementation-detail dependencies are excluded');
});
