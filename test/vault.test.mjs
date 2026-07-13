import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = mkdtempSync(join(tmpdir(), 'dlb-vault-'));
process.env.SONORANCE_HOME = home;
const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { parse } = await import('sonorance/plugins/deliberate/frontmatter.mjs');
const { scaffoldContext } = await import('../src/engine/scaffold.mjs');
const { createProjectWithId } = await import('./project-fixture.mjs');

let store;
before(() => { store = openVault(); createProjectWithId(store, 'p', 'P'); });
after(() => { rmSync(home, { recursive: true, force: true }); });

// A case's folder is `deliberate/cases/YYYY-MM-DD-slug`; find it by the case's id
// (read from each analysis.md — the single file per case). Returns the path relative
// to the vault's `deliberate/`.
const folderOf = (pid, kase) => {
  const root = join(store.getProject(pid).dir, 'deliberate', 'cases');
  const name = readdirSync(root).find(d => {
    try { return String(parse(readFileSync(join(root, d, 'analysis.md'), 'utf8')).data.id) === String(kase.id); } catch { return false; }
  });
  return name ? join('cases', name) : undefined;
};

test('a project is a folder of files (no database)', () => {
  const p = store.getProject('p');
  assert.ok(existsSync(join(p.dir, 'deliberate', 'context', 'product.md')), 'the context lives at deliberate/context/product.md');
  assert.ok(existsSync(join(p.dir, 'deliberate')), 'deliberate/ data dir exists');
  const cfg = JSON.parse(readFileSync(join(p.dir, '.sonorance', 'config.json'), 'utf8'));
  assert.equal(cfg.id, 'p', 'project identity (id/name) lives in the ONE .sonorance/config.json');
  assert.ok(cfg.name && cfg.created_at, 'config.json carries the name + created_at');
  assert.ok(!existsSync(join(p.dir, '.sonorance', 'project.md')), 'no separate project.md');
  assert.ok(!cfg.sources, 'grounding sources are NOT in config.json — they live in the hand-editable sources.md');
  assert.ok(!existsSync(join(home, 'deliberate.db')) && !existsSync(join(home, 'arborra.db')), 'no sqlite file anywhere');
});

test('cases list newest-first by default', () => {
  const a = store.createCase('p', 'first', '');
  const b = store.createCase('p', 'second', '');
  store.setCase(a.id, { score: 2.1 }); store.setCase(b.id, { score: 3.8 });
  assert.deepEqual(store.listCases('p').map(s => s.title), ['second', 'first']);
});

test('case folders are date-prefixed (no number); internal ids stay globally unique; the id is the only handle', () => {
  createProjectWithId(store, 'q', 'Q');
  const s1 = store.createCase('q', 'Cross project case', 'body text');
  assert.notEqual(store.listCases('p')[0].id, s1.id, 'internal ids do not collide across projects');
  const folder = folderOf('q', s1);   // e.g. 'cases/2026-07-03-cross-project-case'
  assert.match(folder, /^cases\/\d{4}-\d{2}-\d{2}-cross-project-case$/, 'folder is deliberate/cases/YYYY-MM-DD-slug (no number)');
  const dir = join(store.getProject('q').dir, 'deliberate', folder);
  assert.ok(!existsSync(join(dir, 'case.md')), 'there is NO separate case.md — the case IS its analysis.md');
  const analysis = readFileSync(join(dir, 'analysis.md'), 'utf8');
  assert.doesNotMatch(analysis, /^case:/m, 'no sequential-number metadata — the hash id is the only handle');
  assert.doesNotMatch(analysis, /^title:/m, 'there is no title metadata property — the title is the # H1');
  assert.match(analysis, /^# Cross project case$/m, 'the title is the record heading');
  assert.equal(store.getCase(s1.id).description, 'body text', 'the raw prompt is a transient frontmatter input');
});

test('listCases exposes last_stage_at = latest stage ended_at (null before any completes)', () => {
  const s = store.createCase('p', 'stage-times', '');
  assert.equal(store.listCases('p').find(x => x.id === s.id).last_stage_at, null, 'no completed stage yet → null');
  store.setStage(s.id, 'frame', { ended_at: 100 });
  store.setStage(s.id, 'shape', { ended_at: 250 });
  assert.equal(store.listCases('p').find(x => x.id === s.id).last_stage_at, 250, 'reads the most recent stage completion');
});

test('project context is host-written markdown (read/writeContext); config keys go to .sonorance/config.json', () => {
  store.writeContext('p', '# Ctx\n\n## Objective\n\nretention\n');
  store.setConfig('p', 'gate', '0');
  assert.match(store.readContext('p'), /## Objective\n\nretention/, 'context is markdown, read back verbatim');
  assert.equal(store.getConfig('p').gate, '0', 'config keys round-trip via getConfig');
  const p = store.getProject('p');
  assert.match(readFileSync(join(p.dir, 'deliberate', 'context', 'product.md'), 'utf8'), /## Objective\n\nretention/, 'context markdown is in the visible product.md');
  assert.match(readFileSync(join(p.dir, '.sonorance', 'config.json'), 'utf8'), /"gate": "0"/, 'a config key is in the platform .sonorance/config.json');
});

test('setStateMany merges keys in one atomic write into state.json (the app buffered-flush target)', () => {
  store.setState('p', 'gate-marker', 'x');   // pre-existing state key to prove merge-not-clobber
  store.setStateMany('p', { explorer: { mode: 'collapsed', ex: ['deliberate/cases'] }, tabs: [] });
  const st = store.getState('p');
  assert.deepEqual(st.explorer, { mode: 'collapsed', ex: ['deliberate/cases'] }, 'a multi-key patch persists + round-trips');
  assert.deepEqual(st.tabs, [], 'all keys in the patch are written');
  assert.equal(st['gate-marker'], 'x', 'existing keys are preserved (merge, not clobber)');
  const p = store.getProject('p');
  // Editor state lives in the machine-local state.json, NOT config.json (which stays identity).
  assert.match(readFileSync(join(p.dir, '.sonorance', 'local', 'state.json'), 'utf8'), /"tabs"/, 'tabs/explorer are in local/state.json');
  assert.ok(!/"tabs"/.test(readFileSync(join(p.dir, '.sonorance', 'config.json'), 'utf8')), 'config.json does not carry editor state');
  // Atomic write leaves no temp file behind.
  assert.ok(!readdirSync(join(p.dir, '.sonorance', 'local')).some(f => f.includes('.tmp-')), 'no temp file is left after an atomic write');
});

test('sources round-trip, incl. an inline description containing an em dash', () => {
  store.addSource('p', 'github.com/x');
  assert.equal(store.listSources('p').find(s => s.location === 'github.com/x').location, 'github.com/x');
  store.addSource('p', 'https://docs.example.com', 'The product docs — grounds scope.');
  assert.equal(store.listSources('p').find(s => s.location === 'https://docs.example.com').description, 'The product docs — grounds scope.', 'the inline description is stored losslessly');
  store.addSource('p', 'https://no-desc.example.com');
  assert.equal(store.listSources('p').find(s => s.location === 'https://no-desc.example.com').description, null, 'no description defaults to null');
});

test('setCase ignores unknown fields and only persists lifecycle keys (state/gate/run_token/prompt)', () => {
  const s = store.createCase('p', 'waiting one', '');
  store.setCase(s.id, { state: 'error', bogus: 1 });
  assert.equal(store.getCase(s.id).state, 'error', 'a known lifecycle field is persisted');
  const analysis = readFileSync(join(store.getProject('p').dir, 'deliberate', folderOf('p', s), 'analysis.md'), 'utf8');
  assert.doesNotMatch(analysis, /^bogus:/m, 'an unknown field is never written to the record');
});

test('app settings: background defaults ON, round-trips, and is not on any project config', () => {
  assert.equal(store.getAppSettings().background, '1', 'background defaults on');
  store.setAppSetting('background', '0');
  assert.equal(store.getAppSettings().background, '0', 'setting persists');
  assert.ok(!store.getConfig('p').background, 'app settings are not stored on a project');
  store.setAppSetting('background', '1');
});

test('stage status transitions persist to the single combined analysis.md', () => {
  const s = store.createCase('p', 'x', '');
  store.setStage(s.id, 'shape', { status: 'done', score: 3.8 });
  assert.equal(store.listStages(s.id).find(x => x.name === 'shape').status, 'done');
  const rec = join(store.getProject('p').dir, 'deliberate', folderOf('p', s), 'analysis.md');
  assert.ok(existsSync(rec), 'the record is one analysis.md (no per-stage note files)');
  assert.match(readFileSync(rec, 'utf8'), /shape_status: done/, 'per-stage state is in the record frontmatter');
});

test('stage error message round-trips and clears when the stage restarts', () => {
  const s = store.createCase('p', 'y', '');
  store.setStage(s.id, 'frame', { status: 'error', error: 'copilot CLI exited with code 1' });
  assert.equal(store.listStages(s.id)[0].error, 'copilot CLI exited with code 1', 'the failure cause persists');
  store.setStage(s.id, 'frame', { status: 'running', error: null });
  assert.equal(store.listStages(s.id)[0].error, null, 'a stale error clears when the stage re-runs');
});

test('a fresh case is one analysis.md (title only) with no stage sections until a stage runs', () => {
  const s = store.createCase('p', 'clean', '');
  for (const stage of ['frame', 'shape', 'launch', 'prototype']) store.setStage(s.id, stage, {});   // the newCase init loop
  assert.equal(store.listStages(s.id).length, 0, 'no stages recorded for a case that has not run');
  const rec = join(store.getProject('p').dir, 'deliberate', folderOf('p', s), 'analysis.md');
  assert.ok(existsSync(rec), 'the case IS its analysis.md from creation');
  const text = readFileSync(rec, 'utf8');
  assert.match(text, /^# clean$/m, 'it carries the title as the # H1');
  assert.doesNotMatch(text, /^## /m, 'but no stage sections yet (absence = pending)');
  assert.equal(store.readRecord(s.id).exists, false, 'readRecord reports no content beyond the bare title');
});

test('writeStage: a stage full lands in analysis.md; prototype is a one-line link + sidecar (no HTML dump)', () => {
  const s = store.createCase('p', 'artifacts', '');
  // A normal stage: its full artifact is embedded under its `## <Stage>` section.
  store.setStage(s.id, 'shape', { status: 'done' });
  store.writeStage('p', s.id, 'shape', { 'output_full.md': '### Concept\n\nbody' });
  assert.equal(store.readStage('p', s.id, 'shape', 'output_full.md'), '### Concept\n\nbody');
  // Prototype: only the index.html sidecar; the record links to it (no HTML dump).
  store.setStage(s.id, 'prototype', { status: 'done' });
  store.writeStage('p', s.id, 'prototype', { 'index.html': '<!doctype html><h1>hi</h1>' });
  const caseDir = join(store.getProject('p').dir, 'deliberate', folderOf('p', s));
  const rec = readFileSync(join(caseDir, 'analysis.md'), 'utf8');
  assert.match(rec, /## Shape\n\n### Concept\n\nbody/, 'the shape section embeds its artifact under a clean ## header (no markers)');
  assert.doesNotMatch(rec, /<!--/, 'no HTML-comment section markers in the record');
  assert.match(rec, /## Prototype\n\nAn interactive prototype[^\n]*\.\/prototype\/index\.html/, 'the prototype section is a single-sentence link');
  assert.doesNotMatch(rec, /<h1>hi<\/h1>/, 'the prototype HTML is NOT dumped into the record');
  assert.doesNotMatch(rec, /\*\*Summary\*\*|By the \*\*/, 'no per-section summaries or agent attribution lines');
  assert.match(store.readStage('p', s.id, 'prototype', 'index.html'), /<h1>hi<\/h1>/, 'the HTML lives in the sidecar');
  assert.ok(existsSync(join(caseDir, 'prototype', 'index.html')), 'sidecar in <case>/prototype/');
});

test('agent-authored summary lede + Key highlights round-trip; the raw prompt is dropped once summarized', () => {
  const s = store.createCase('p', 'hl', 'raw idea text');
  const file = join(store.getProject('p').dir, 'deliberate', folderOf('p', s), 'analysis.md');
  assert.match(readFileSync(file, 'utf8'), /^prompt: raw idea text$/m, 'the raw prompt is held as a transient input until summarized');
  // No dedicated summary/highlights commands: the host edits the record as a file — a 1–2
  // sentence summary lede under the H1 and a Key highlights block.
  const raw = readFileSync(file, 'utf8');
  writeFileSync(file, raw.replace('# hl\n', '# hl\n\nA crisp one-line summary of the case.\n\n## Key highlights\n\n- one\n- two\n'));
  // A later stage save re-renders the record structurally, preserving both (canonically placed).
  store.setStage(s.id, 'frame', { status: 'done' });
  store.writeStage('p', s.id, 'frame', { 'output_full.md': '### Problem\n\nx' });
  const rec = readFileSync(file, 'utf8');
  assert.match(rec, /# hl\n\nA crisp one-line summary of the case\.\n\n## Key highlights\n\n- one\n- two/, 'the lede + highlights render right after the title');
  assert.ok(rec.indexOf('## Key highlights') < rec.indexOf('## Frame'), 'highlights come before the stage sections');
  assert.doesNotMatch(rec, /^prompt:/m, 'the raw prompt is dropped once a summary lede exists');
  assert.equal(store.getCase(s.id).summary, 'A crisp one-line summary of the case.', 'the parsed lede is the case summary that grounds later stages');
});

test('setStage records the harness type + resumable session id per stage (for Ask-agent resume)', () => {
  const s = store.createCase('p', 'harness meta', '');
  store.setStage(s.id, 'frame', { status: 'running', harness: 'copilot-cli', session: 'dlb-p-1-tok' });
  const recPath = join(store.getProject('p').dir, 'deliberate', folderOf('p', s), 'analysis.md');
  const rec = readFileSync(recPath, 'utf8');
  assert.match(rec, /frame_harness: copilot-cli/, 'harness type lands in the record frontmatter');
  assert.match(rec, /frame_session: dlb-p-1-tok/, 'resumable session id lands in the record frontmatter');
  const row = () => store.listStages(s.id).find(r => r.name === 'frame');
  assert.equal(row().harness, 'copilot-cli', 'listStages exposes harness');
  assert.equal(row().session, 'dlb-p-1-tok', 'listStages exposes session');
  // A later DONE update (which does not re-pass them) must NOT drop harness/session.
  store.setStage(s.id, 'frame', { status: 'done', score: 7, ended_at: Date.now() });
  assert.equal(row().session, 'dlb-p-1-tok', 'session persists across the DONE update');
  // A rerun (reset to pending) clears the whole stage, session included.
  store.setStage(s.id, 'frame', { status: 'pending' });
  assert.doesNotMatch(readFileSync(recPath, 'utf8'), /frame_session/, 'a rerun clears the recorded session');
});

test('run log appends to per-case log.jsonl', () => {
  const s = store.createCase('p', 'logged', '');
  store.log(s.id, 'score', 'producer', 'claude-opus-4.8');
  store.log(s.id, 'score', 'critic', 'gpt-5.4', 'proceed');
  const runs = store.runs(s.id);
  assert.equal(runs.length, 2);
  assert.equal(runs[1].verdict, 'proceed');
});

test('listCases filters by min score', () => {
  createProjectWithId(store, 'u', 'U');
  const a = store.createCase('u', 'low', ''); const b = store.createCase('u', 'high', '');
  // A case's score is the decorrelated Evaluator's go/no-go, stamped on the record's
  // top-level frontmatter (by writeScore, or directly here) — not a funnel stage.
  store.setCase(a.id, { score: 1.6 });
  store.setCase(b.id, { score: 3.8 });
  assert.ok(store.listCases('u', { min: 3 }).every(s => s.score >= 3));
  assert.equal(store.listCases('u', { min: 3 }).length, 1, 'only the case at/above the threshold is listed');
});

test('removing a project forgets the registry entry without deleting the user-owned folder', () => {
  createProjectWithId(store, 'z', 'Z');
  const dir = store.getProject('z').dir;
  store.createCase('z', 's', ''); store.addSource('z', 'x'); store.setConfig('z', 'objective', 'v');
  store.removeProject('z');
  assert.equal(store.getProject('z'), undefined);
  assert.ok(existsSync(dir), 'forgetting a vault never deletes its user-owned files');
  assert.ok(existsSync(join(dir, 'deliberate', 'cases')), 'the project records stay on disk');
});

test('reindex rebuilds the caseId → folder map by scanning the vault', () => {
  const s = store.createCase('p', 'reindexed', 'hi');
  const fresh = openVault();   // a new process-equivalent store
  assert.equal(fresh.getCase(s.id)?.title, 'reindexed', 'a fresh store finds the case purely from files');
});

test('a case is renamed by editing its analysis.md `# H1` directly (no retitle command; folder slug is stable)', () => {
  const s = store.createCase('p', 'i want to share a snapshot of a decision record via a public link', 'body');
  const file = join(store.getProject('p').dir, 'deliberate', folderOf('p', s), 'analysis.md');
  const oldFolder = folderOf('p', s).replace('cases/', '');
  assert.match(oldFolder, /^\d{4}-\d{2}-\d{2}-/, 'folder is date-prefixed (no number)');
  // Editing the H1 is a plain file edit; it round-trips and becomes the case title.
  writeFileSync(file, readFileSync(file, 'utf8').replace(/^# .*$/m, '# Shareable decision link'));
  assert.equal(store.getCase(s.id).title, 'Shareable decision link', 'the title is the record `# H1`, edited in place');
  assert.equal(folderOf('p', s), 'cases/' + oldFolder, 'the folder name is unchanged (title lives in the body, not the path)');
});

test('in-record comments: project-level comments.jsonl in .sonorance/local/, keyed by file (cases AND briefs)', () => {
  const s = store.createCase('p', 'comment me', 'body');
  const caseFile = store.recordFile(s.id);
  const briefFile = join(store.getProject('p').dir, 'deliberate', 'briefs', '2026-06-01', 'brief.md');
  assert.deepEqual(store.comments('p', caseFile), [], 'no comments before any annotation');

  const t = store.addComment('p', caseFile, { anchor: { quote: 'urgency score', heading: 'Score' }, body: 'what backs this?', author: 'user' });
  assert.ok(t && t.id && t.status === 'open', 'a new comment is open with an id');
  assert.ok(!t.file.startsWith('/') && !t.file.startsWith('..'), 'the stored file path is project-root-relative');
  // Comments are a GENERIC Sonorance feature → machine-local state under .sonorance/local/, not
  // under the deliberate/ brand folder and not inside the case folder.
  const store_file = join(store.getProject('p').dir, '.sonorance', 'local', 'comments.jsonl');
  assert.ok(existsSync(store_file), 'comments.jsonl lives in the .sonorance/local/ dir');
  assert.ok(!existsSync(join(store.getProject('p').dir, 'deliberate', folderOf('p', s), 'comments.jsonl')), 'NOT inside the case folder');

  // A comment on a BRIEF file goes to the same store, keyed by its file.
  store.addComment('p', briefFile, { anchor: { quote: 'a', heading: 'Highlights' }, body: 'source?', author: 'user' });
  assert.equal(store.comments('p', caseFile).length, 1, 'the case file has one comment');
  assert.equal(store.comments('p', briefFile).length, 1, 'the brief file has its own comment');
  assert.equal(store.allComments('p').length, 2, 'both live in the one project-level store');

  const upd = store.resolveComment('p', t.id, { status: 'resolved', note: 'edited the why-now.', revised: true });
  assert.equal(upd.status, 'resolved');
  assert.equal(store.comments('p', caseFile)[0].note, 'edited the why-now.');
  assert.equal(store.resolveComment('p', 'nope', { status: 'resolved' }), null, 'resolving an unknown comment returns null');

  // The reader can delete their own comment outright (distinct from the agent resolving it).
  const d = store.addComment('p', caseFile, { anchor: { quote: 'x', heading: 'Frame' }, body: 'delete me', author: 'user' });
  assert.equal(store.allComments('p').length, 3);
  const del = store.deleteComment('p', d.id);
  assert.ok(del && del.id === d.id, 'deleteComment returns the removed record');
  assert.ok(!store.allComments('p').some(c => c.id === d.id), 'the deleted comment is gone from the store');
  assert.equal(store.deleteComment('p', 'nope'), null, 'deleting an unknown comment returns null');
  // A path escaping the project is rejected.
  assert.equal(store.addComment('p', '/etc/passwd', { anchor: {}, body: 'x' }), null, 'a file outside the project is rejected');
});

test('deleting a case or brief prunes its comments (no orphaned annotations)', () => {
  const kept = store.createCase('p', 'keep', '');
  store.addComment('p', store.recordFile(kept.id), { anchor: { quote: 'a', heading: '' }, body: 'stays', author: 'user' });
  const doomed = store.createCase('p', 'doomed', '');
  store.addComment('p', store.recordFile(doomed.id), { anchor: { quote: 'b', heading: '' }, body: 'goes', author: 'user' });
  const before = store.allComments('p').length;
  store.deleteCase(doomed.id);
  assert.equal(store.allComments('p').length, before - 1, 'the deleted case\'s comment is pruned');
  assert.ok(store.allComments('p').some(c => c.body === 'stays'), 'other cases\' comments are untouched');
  assert.ok(!store.allComments('p').some(c => c.body === 'goes'), 'the orphaned comment is gone');
  // Same for a brief.
  const t = Date.parse('2026-08-01T00:00:00Z');
  const b = store.createBrief('p', { period_start: Date.parse('2026-05-01'), period_end: t, model: 'stub', body: '# B\n' }, t);
  store.addComment('p', store.briefFilePath(b.id), { anchor: { quote: 'c', heading: '' }, body: 'brief-note', author: 'user' });
  const beforeB = store.allComments('p').length;
  store.deleteBrief(b.id);
  assert.equal(store.allComments('p').length, beforeB - 1, 'the deleted brief\'s comment is pruned');
});

test('briefs: created under deliberate/briefs/<date>/brief.md with frontmatter + body', () => {
  const t = Date.parse('2026-05-10T12:00:00Z');
  const b = store.createBrief('p', { period_start: Date.parse('2026-02-10'), period_end: t, model: 'stub', body: '# Brief\n\n* item' }, t);
  assert.ok(/[a-f]/.test(b.id), 'the brief id is a hash string (contains a letter)');
  const root = join(store.getProject('p').dir, 'deliberate', 'briefs');
  assert.ok(readdirSync(root).some(d => /^2026-05-10/.test(d)), 'the folder is dated YYYY-MM-DD');
  const rec = store.readBriefRecord(b.id);
  assert.equal(rec.exists, true);
  assert.match(rec.text, /# Brief/, 'the body is written');
  assert.equal(rec.period_end, t, 'the window end round-trips');
});

test('briefs: listBriefs is newest-first and lastBriefEnd tracks the latest window end', () => {
  const p = createProjectWithId(store, 'bproj', 'B').id;
  const older = Date.parse('2026-01-01');
  const newer = Date.parse('2026-04-01');
  store.createBrief(p, { period_start: older - 100, period_end: older, body: '# Brief\n\n* a' }, older);
  store.createBrief(p, { period_start: newer - 100, period_end: newer, body: '# Brief\n\n* b' }, newer);
  const list = store.listBriefs(p);
  assert.equal(list.length, 2);
  assert.equal(list[0].period_end, newer, 'newest brief first');
  assert.equal(store.lastBriefEnd(p), newer, 'lastBriefEnd is the max window end');
  assert.equal(new Set(list.map(b => b.id)).size, 2, 'each brief has a distinct hash id');
});

test('briefs: delete removes the folder and reindex rebuilds the brief map', () => {
  const p = createProjectWithId(store, 'bdel', 'BDel').id;
  const b = store.createBrief(p, { period_start: 1, period_end: 2, body: '# Brief' }, Date.now());
  assert.ok(store.getBrief(b.id), 'brief resolvable before delete');
  store.deleteBrief(b.id);
  assert.equal(store.getBrief(b.id), undefined, 'gone after delete');
  assert.equal(store.listBriefs(p).length, 0, 'the list is empty');
  const fresh = openVault();
  assert.equal(fresh.lastBriefEnd(p), null, 'a fresh store reindexes to no briefs');
});

test('init scaffolds ground the brief: product.md has Ecosystem + Market sections; competitors.md is per-competitor + change-oriented; ecosystem.md per-player', () => {
  const p = scaffoldContext(createProjectWithId(store, 'scaffold', 'Scaffold'));
  const prod = readFileSync(join(p.dir, 'deliberate', 'context', 'product.md'), 'utf8');
  assert.match(prod, /##\s+Competitors/, 'still has a Competitors section');
  assert.match(prod, /##\s+Ecosystem/, 'adds an Ecosystem players roster to ground the brief market lens');
  assert.match(prod, /##\s+Market\b/, 'adds a Market section for the space (category/standards/trends)');
  assert.match(prod, /##\s+Customer voice\b/, 'adds a Customer voice section for durable feedback signals');
  assert.match(prod, /product-owned GitHub repository.*verify it is public and Issues are enabled/is, 'public enabled GitHub Issues are treated as customer evidence');
  assert.match(prod, /Dependency.*Complement.*Channel.*Mover/s, 'classifies ecosystem players by position');
  assert.match(prod, /only critical upstream.*whose roadmap.*could materially affect/is, 'dependency inclusion is filtered by strategic materiality');
  assert.match(prod, /ordinary libraries.*transitive/i, 'ordinary and transitive implementation dependencies are excluded');
  assert.match(prod, /current.*potential|potential.*current/i, 'ecosystem players carry a current/potential status');
  assert.match(prod, /standards? & protocols|standard \/ protocol/i, 'Market names standards/protocols to watch');
  const comp = readFileSync(join(p.dir, 'deliberate', 'context', 'competitors.md'), 'utf8');
  assert.match(comp, /per competitor/i, 'competitors.md is scoped per competitor (not a stingy 10 total)');
  assert.doesNotMatch(comp, /Up to 10 total/, 'the old 10-total cap is gone');
  assert.match(comp, /changelog|release notes/i, 'prioritises change-surfacing sources');
  assert.match(comp, /landscape brief|\/deliberate brief/i, 'notes these sources ground the periodic brief');
  const eco = readFileSync(join(p.dir, 'deliberate', 'context', 'ecosystem.md'), 'utf8');
  assert.match(eco, /per player|each ecosystem player/i, 'ecosystem.md is scoped per player');
  assert.match(eco, /strategically material/i, 'ecosystem.md includes only strategically material players');
  assert.match(eco, /meaningful and actionable/i, 'ecosystem monitoring is filtered for decision relevance');
  assert.match(eco, /changelog|release notes|advisor/i, 'prioritises change-surfacing sources');
  assert.match(eco, /landscape brief|\/deliberate brief/i, 'notes these ground the periodic brief');
});

test('context scaffolds are the Initiator role output-templates (single source of truth, {{name}} substituted)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const tplProduct = readFileSync(join(repoRoot, 'roles', 'initiator', 'init', 'output-template-product.md'), 'utf8');
  const tplComp = readFileSync(join(repoRoot, 'roles', 'initiator', 'init', 'output-template-competitors.md'), 'utf8');
  const tplEco = readFileSync(join(repoRoot, 'roles', 'initiator', 'init', 'output-template-ecosystem.md'), 'utf8');
  const p = scaffoldContext(createProjectWithId(store, 'tpl', 'TplProj'));
  const prod = readFileSync(join(p.dir, 'deliberate', 'context', 'product.md'), 'utf8');
  const comp = readFileSync(join(p.dir, 'deliberate', 'context', 'competitors.md'), 'utf8');
  const eco = readFileSync(join(p.dir, 'deliberate', 'context', 'ecosystem.md'), 'utf8');
  assert.equal(prod, tplProduct.replace(/\{\{name\}\}/g, 'TplProj'), 'product.md is the template with the project name substituted');
  assert.equal(comp, tplComp, 'competitors.md is the template verbatim');
  assert.equal(eco, tplEco, 'ecosystem.md is the template verbatim');
  assert.doesNotMatch(prod, /\{\{/, 'no unsubstituted placeholders leak into the written scaffold');
});

test('product.md scaffold carries the commercial/GTM grounding sections + a never-fabricate missing-source rule', () => {
  const p = scaffoldContext(createProjectWithId(store, 'commercial', 'Commercial'));
  const prod = readFileSync(join(p.dir, 'deliberate', 'context', 'product.md'), 'utf8');
  for (const section of ['Value proposition & positioning', 'Business model & pricing', 'Distribution & channels', 'Metrics & traction']) {
    assert.match(prod, new RegExp(`##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `product.md has a "${section}" section`);
  }
  assert.match(prod, /Not covered by the provided sources/, 'the scaffold defines the explicit "missing source" marker (no fabrication, no "unknown")');
  assert.match(prod, /Never fabricate/i, 'the scaffold states the never-fabricate rule');
  assert.doesNotMatch(prod, /unknown \/ not yet/i, 'the missing convention is "not covered by the provided sources", not "unknown / not yet"');
  assert.match(prod, /Readout period.*completed calendar week, Monday–Sunday.*timezone/is, 'the scaffold defines one shared default readout period');
  assert.match(prod, /Every metric and evidence source uses this period/i, 'the report-level period grounds all evidence');
  assert.doesNotMatch(prod, /current baseline\/date|target\/date/i, 'one-time init does not scaffold volatile metric snapshots');
});

test('init links the root README to deliberate/context idempotently for agent discovery', () => {
  const p = createProjectWithId(store, 'readme-context', 'README Context');
  const readme = join(p.dir, 'README.md');
  writeFileSync(readme, '# Existing project\n\nExisting description.\n');
  scaffoldContext(p);
  scaffoldContext(p);
  const body = readFileSync(readme, 'utf8');
  assert.match(body, /## Product context for agents/);
  assert.match(body, /\[`deliberate\/context\/`\]\(deliberate\/context\/\)/);
  assert.match(body, /Agents should read those files before product, strategy, market, positioning, or implementation work/);
  assert.equal(body.match(/## Product context for agents/g)?.length, 1, 're-running init does not duplicate the pointer');
  assert.match(body, /^# Existing project/m, 'existing README content is preserved');
});

test('competitor roster is a prioritized field (5–10, more if crowded), distinct from Frame\'s per-change ≤5 table', () => {
  const p = scaffoldContext(createProjectWithId(store, 'roster', 'Roster'));
  const prod = readFileSync(join(p.dir, 'deliberate', 'context', 'product.md'), 'utf8');
  assert.match(prod, /5[–-]10/, 'the roster targets a prioritized 5–10, not a token few');
  assert.match(prod, /order by relevance|most-relevant first/i, 'the roster is ordered by relevance (so the brief focuses, quiet ones cost nothing)');
  assert.match(prod, /\bEcosystem\b/, 'emerging/adjacent players are pushed to Ecosystem, keeping the roster direct');
  assert.doesNotMatch(prod, /\(3[–-]7\)/, 'the old hard 3–7 cap is gone');
});

test('#writeAnalysis reflows host-written hard-wrapped prose (summary lede + Key highlights)', () => {
  const s = store.createCase('p', 'wrap test', '');
  const rf = store.recordFile(s.id);
  const fm = readFileSync(rf, 'utf8').match(/^---\n[\s\S]*?\n---\n/)[0];   // keep the machine frontmatter
  // Simulate a host DIRECT edit (bypasses `save`/unwrapProse): a hard-wrapped summary lede and a
  // hard-wrapped Key highlights bullet — the exact shape that leaked artificial newlines.
  writeFileSync(rf, fm + '\n# Wrap Test\n\nThis summary was hard-wrapped by\nthe host across two source lines.\n\n## Key highlights\n\n- The verdict is advance because the\n  problem is real and reachable.\n');
  store.setStage(s.id, 'frame', { status: 'done' });   // any engine re-render must reflow the prose
  const out = readFileSync(rf, 'utf8');
  assert.match(out, /This summary was hard-wrapped by the host across two source lines\./, 'the summary lede is joined onto one line');
  assert.match(out, /- The verdict is advance because the problem is real and reachable\./, 'the Key highlights bullet is joined onto one line');
});

test('a Deliberate vault registers the deliberate plugin so `sonorance serve` composes the flavor', async () => {
  const p = createProjectWithId(store, 'flavored', 'Flavored');
  // createProject wrote .sonorance/plugins.json enabling the deliberate plugin — by ID (the host
  // maps the id to its bundled `plugins/deliberate` contribution; no machine path in the vault).
  const plugins = JSON.parse(readFileSync(join(p.dir, '.sonorance', 'plugins.json'), 'utf8')).plugins;
  const dlb = plugins.find(x => x.id === 'deliberate');
  assert.ok(dlb && dlb.enabled === true, 'the deliberate plugin is enabled in plugins.json');
  assert.ok(!dlb.module, 'registration is id-based — no absolute engine path leaks into the vault config');
  // The generic app's plugin loader, given ONLY the vault dir, COMPOSES the Deliberate flavor onto
  // the base engine — proving `sonorance serve` on a Deliberate vault lights up cases/briefs while
  // the app's identity stays Sonorance (no whole-app reskin, no reverse import).
  const { resolveEngine } = await import('sonorance/plugins');
  const engine = await resolveEngine(p.dir);
  assert.ok(Array.isArray(engine.KINDS) && engine.KINDS.length > 0, 'the contribution adds the case/brief kinds (inbox + prototype light up)');
});
