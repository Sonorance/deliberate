import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// The deliberate CLI is the telemetry choke point for the skill (it configures surface=cli,
// product=deliberate). These tests drive the real binary in a throwaway HOME with telemetry in
// `console` mode — which still writes the local audit trail ($HOME/telemetry.jsonl) but never
// touches the network — then assert against that audit + the local feedback mirror. This is the
// only surface that proves the value-moment emits and that explicit feedback is not duplicated into
// the passive, content-free telemetry audit.

const cli = join(dirname(fileURLToPath(import.meta.url)), '../src/cli/deliberate.mjs');
const homes = [];
const freshHome = () => { const h = mkdtempSync(join(tmpdir(), 'dlb-tel-home-')); homes.push(h); return h; };
const freshRepo = () => { const r = mkdtempSync(join(tmpdir(), 'dlb-tel-repo-')); homes.push(r); return r; };
after(() => { for (const d of homes) rmSync(d, { recursive: true, force: true }); });

// Run the CLI with telemetry piped to the local audit trail (console mode). stdout is captured;
// the console-mode telemetry that prints to stderr is dropped so it can't pollute assertions.
function runTel(cwd, home, args, input) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd, encoding: 'utf8', input,
    env: { ...process.env, SONORANCE_HOME: home, SONORANCE_TELEMETRY: 'console', DELIBERATE_MODEL: 'stub' },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
}
const auditEvents = (home) => {
  const p = join(home, 'telemetry.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const types = (home) => auditEvents(home).map((e) => e.type);

test('deliberate CLI: `feedback` sends one verbatim record and does not duplicate it into passive telemetry', () => {
  const home = freshHome(), repo = freshRepo();
  runTel(repo, home, ['init']);
  const out = runTel(repo, home, ['feedback', 'The export button silently failed for me', '--category', 'bug', '--rating', 'down']);
  assert.match(out, /feedback sent/, 'the CLI confirms the submission with an id');

  // The local mirror keeps the user's words EXACTLY (this copy is theirs/the founder's — content-full).
  const mirror = join(repo, '.sonorance', 'local', 'feedback.jsonl');
  assert.ok(existsSync(mirror), 'a durable local feedback mirror is written first');
  const rec = JSON.parse(readFileSync(mirror, 'utf8').trim().split('\n').pop());
  assert.equal(rec.message, 'The export button silently failed for me', 'the message is stored verbatim, never reworded');
  assert.equal(rec.category, 'bug');
  assert.equal(rec.rating, 'down');

  // submitFeedback owns the ONE outbound feedback record. The passive telemetry client must not
  // emit a second category/rating event (which would double-count every submission downstream).
  const ev = auditEvents(home).filter((e) => e.type === 'feedback');
  assert.equal(ev.length, 0, 'no duplicate passive feedback event is emitted');
  assert.ok(!JSON.stringify(auditEvents(home)).includes('export button'), 'user content never leaks into passive telemetry');
});

test('deliberate CLI: `feedback` on an idea nudges problem-framing when flagged, but still sends the words unchanged', () => {
  const home = freshHome(), repo = freshRepo();
  runTel(repo, home, ['init']);
  const out = runTel(repo, home, ['feedback', 'Add a dark mode toggle', '--category', 'idea', '--needs-framing']);
  assert.match(out, /frame the PROBLEM/i, 'a needs-framing idea prints the structure-not-rewrite nudge');
  const rec = JSON.parse(readFileSync(join(repo, '.sonorance', 'local', 'feedback.jsonl'), 'utf8').trim().split('\n').pop());
  assert.equal(rec.message, 'Add a dark mode toggle', 'the words are sent unchanged even when framing is flagged');
  assert.equal(rec.needs_framing, true, 'the record is flagged for founder-side framing');
});

test('deliberate CLI: the funnel emits the suite-wide value moments (case → stage → completed → scored → prototype)', () => {
  const home = freshHome(), repo = freshRepo();
  runTel(repo, home, ['init']);
  runTel(repo, home, ['case', 'Bulk export to CSV for busy teams']);

  const art = join(repo, 'art.md');
  for (const st of ['frame', 'shape', 'launch']) {
    writeFileSync(art, `# ${st}\n\nGrounded ${st}.`);
    runTel(repo, home, ['case', 'analysis', 'save', '--file', art]);
  }
  writeFileSync(art, '# Score\n\nNo numeric score was produced.');
  runTel(repo, home, ['case', 'score', 'save', '--model', 'gpt-5.4', '--independent', '--file', art]);
  assert.equal(types(home).filter((x) => x === 'case.scored').length, 0, 'an unparseable score is not a value moment');
  writeFileSync(art, '# Score\n\n**Score:** 7.5\n- reason one\n- reason two');
  runTel(repo, home, ['case', 'score', 'save', '--model', 'gpt-5.4', '--independent', '--file', art]);
  writeFileSync(art, '# Prototype\n\n```html\n<!DOCTYPE html><html><body><h1>proto</h1></body></html>\n```');
  runTel(repo, home, ['case', 'prototype', 'save', '--file', art]);

  const t = types(home);
  for (const need of ['case.created', 'case.stage.completed', 'case.completed', 'case.scored', 'prototype.built'])
    assert.ok(t.includes(need), `the funnel emits ${need}`);
  for (const event of auditEvents(home).filter((e) => ['case.created', 'case.stage.completed', 'case.completed', 'case.scored', 'prototype.built'].includes(e.type)))
    assert.equal(event.props.lens, 'product', `${event.type} carries the durable low-cardinality case lens`);

  // A 7.5 maps to a `go` verdict enum (never the raw number, never text).
  const scored = auditEvents(home).filter((e) => e.type === 'case.scored').at(-1);
  assert.equal(scored.props.verdict, 'go', 'a passing score becomes the `go` verdict enum');
  assert.equal(scored.props.independent, true, 'the content-free evaluator-isolation guardrail is emitted');
  // The final funnel stage completes analysis; scoring is a separate companion and the first score
  // is the case value moment. Re-scores are explicitly marked so WVM does not inflate.
  const completed = auditEvents(home).filter((e) => e.type === 'case.completed').at(-1);
  assert.deepEqual(completed.props, { lens: 'product' }, 'case.completed records only the durable lens, not a pretend Score result');
  assert.equal(scored.props.refreshed, false, 'the first score is marked as a fresh value moment');
  writeFileSync(art, '# Score\n\n**Score:** 7.5\n- reason one\n- reason two');
  runTel(repo, home, ['case', 'score', 'save', '--model', 'claude-opus-4.8', '--file', art]);
  const rescored = auditEvents(home).filter((e) => e.type === 'case.scored').at(-1);
  assert.equal(rescored.props.refreshed, true, 'a repeated score is marked as a refresh, not another value moment');
  assert.equal(rescored.props.independent, false, 'a same-session fallback is visible as a non-independent guardrail');
  // The prototype records only the coarse surface and lens enums.
  const built = auditEvents(home).filter((e) => e.type === 'prototype.built').at(-1);
  assert.equal(built.props.surface, 'default', 'the default-surface prototype records surface=default');
  assert.equal(built.props.lens, 'product', 'the eligible prototype records its low-cardinality case lens');

  // install.created fires EXACTLY once across many commands on one install.
  assert.equal(t.filter((x) => x === 'install.created').length, 1, 'install.created fires exactly once on the first run');
  // Every command run emits a content-free command.run seam event.
  assert.ok(t.includes('command.run'), 'each command emits the universal command.run seam event');
});

test('deliberate CLI: brief + readout + matchup emit their value moments (matchup marks a refresh in place)', () => {
  const home = freshHome(), repo = freshRepo();
  runTel(repo, home, ['init']);

  runTel(repo, home, ['brief', 'save'], '# Brief\n\n* the landscape moved.\n');
  const readoutArgs = ['readout', 'save', '--period-start', '2020-06-01', '--period-end', '2020-06-30', '--timezone', 'UTC'];
  runTel(repo, home, readoutArgs, '# Product readout\n\nPeriod: June 1, 2020 – June 30, 2020\n\n## Key takeaways\n\n- Activation rose.\n');
  runTel(repo, home, readoutArgs, '# Product readout\n\nPeriod: June 1, 2020 – June 30, 2020\n\n## Key takeaways\n\n- Retention rose.\n');
  const matchupArt = '# Matchup — Globex vs Us\n\nAs of July 1, 2026.\n\n## Bottom line\n\nGlobex ships a caching layer. [Source](https://globex.example/x)\n';
  runTel(repo, home, ['matchup', 'save', 'Globex', '--file', writeArt(repo, matchupArt)]);
  runTel(repo, home, ['matchup', 'save', 'Globex', '--file', writeArt(repo, matchupArt)]);   // same rival → refresh

  assert.ok(types(home).includes('brief.completed'), 'a saved brief emits brief.completed');
  assert.equal(types(home).filter((type) => type === 'readout.completed').length, 2, 'each newly persisted readout is a value moment');
  const matchups = auditEvents(home).filter((e) => e.type === 'matchup.completed');
  assert.equal(matchups.length, 2, 'each matchup save emits matchup.completed');
  assert.equal(matchups[0].props.refreshed, false, 'the first matchup for a rival is not a refresh');
  assert.equal(matchups[1].props.refreshed, true, 're-running the same rival is marked as a refresh in place');
});

test('deliberate CLI: telemetry OFF collects nothing — no audit, no events', () => {
  const home = freshHome(), repo = freshRepo();
  execFileSync(process.execPath, [cli, 'init'], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, SONORANCE_HOME: home, SONORANCE_TELEMETRY: 'off', DELIBERATE_MODEL: 'stub' },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  execFileSync(process.execPath, [cli, 'case', 'An idea that should leave no trace'], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, SONORANCE_HOME: home, SONORANCE_TELEMETRY: 'off', DELIBERATE_MODEL: 'stub' },
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  assert.equal(auditEvents(home).length, 0, 'no telemetry audit is written when telemetry is off');
});

let artN = 0;
function writeArt(dir, body) {
  const p = join(dir, `art-${artN++}.md`);
  writeFileSync(p, body);
  return p;
}
