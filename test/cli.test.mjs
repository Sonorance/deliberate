import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, realpathSync, existsSync, readFileSync, readdirSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

// Isolated home + offline stub model, shared with the spawned CLI process.
const home = mkdtempSync(join(tmpdir(), 'dlb-cli-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';
after(() => rmSync(home, { recursive: true, force: true }));

const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { setCurrentProject } = await import('../src/engine/service.mjs');
const { SKILL_COMMANDS } = await import('../src/engine/commands.mjs');
const { createProject } = await import('./project-fixture.mjs');

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(repoRoot, 'src/cli/deliberate.mjs');
const runIn = (cwd, ...args) => execFileSync(process.execPath, [cli, ...args], { cwd, env: process.env, encoding: 'utf8' });
const resultIn = (cwd, args, env = process.env) => spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
const stripAnsi = (text) => text.replace(/\x1B\[[0-9;]*m/g, '');

test('CLI runs when invoked through an installed-bin symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dlb-bin-'));
  const bin = join(dir, 'deliberate-cli');
  try {
    symlinkSync(cli, bin);
    assert.match(stripAnsi(execFileSync(process.execPath, [bin, 'help'], { cwd: dir, env: process.env, encoding: 'utf8' })), /deliberate/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI `help --skill` renders the exact live /deliberate grammar', () => {
  const expected = [
    'Deliberate skill grammar',
    ...SKILL_COMMANDS.flatMap(([command, description]) => [`  ${command}`, `      ${description}`]),
    '',
  ].join('\n');
  const uninitialized = mkdtempSync(join(tmpdir(), 'dlb-help-'));
  try {
    assert.equal(stripAnsi(runIn(uninitialized, 'help', '--skill')), expected);
  } finally {
    rmSync(uninitialized, { recursive: true, force: true });
  }
});

test('CLI `source add` records a categorized external source without treating --section as description; `source remove` drops it', async () => {
  const store = openVault();
  const p = await createProject(store, 'CliSrc');
  setCurrentProject(store, p.id);
  const add = runIn(p.dir, 'source', 'add', '/tmp/whatever', 'Roadmap', 'notes', '--section', 'metrics-data');
  assert.match(add, /source added/, 'source add confirms');
  const source = openVault().listSources(p.id).find(s => s.location === '/tmp/whatever');
  assert.equal(source.description, 'Roadmap notes', 'the inline description is stored with the source');
  assert.equal(source.section, 'metrics-data', 'the source is grouped under the requested section');
  assert.match(runIn(p.dir, 'source', 'list'), /Roadmap notes/, 'source list prints the description');
  assert.match(runIn(p.dir, 'source', 'list'), /Metrics & data/, 'source list prints the section heading');
  runIn(p.dir, 'source', 'remove', '/tmp/whatever');
  assert.equal(openVault().listSources(p.id).length, 0, 'source remove drops the source');
});

test('CLI rejects in-project sources and hides legacy in-project entries', async () => {
  const store = openVault();
  const p = await createProject(store, 'CliSrcBoundary');
  setCurrentProject(store, p.id);
  const inside = join(p.dir, 'docs', 'context.md');
  mkdirSync(dirname(inside), { recursive: true });
  writeFileSync(inside, 'local context');

  for (const location of ['docs/context.md', inside, pathToFileURL(inside).href]) {
    const result = resultIn(p.dir, ['source', 'add', location]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /outside the current project folder.*read automatically/i);
  }

  store.addSource(p.id, inside, 'Legacy local entry', 'other');
  store.addSource(p.id, 'https://example.com/external', 'External entry', 'other');
  const listed = runIn(p.dir, 'source', 'list');
  assert.doesNotMatch(listed, /Legacy local entry/);
  assert.match(listed, /External entry/);
});

test('`deliberate init` gitignores machine state (.sonorance/local/ + hidden deliberate/ subfolders) ONLY when a .gitignore exists', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-gi-'));
  const bare = mkdtempSync(join(tmpdir(), 'dlb-gi-none-'));
  try {
    // (a) a repo WITH a .gitignore and a hidden subfolder under deliberate/.
    writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
    mkdirSync(join(repo, 'deliberate', '.cache'), { recursive: true });
    runIn(repo, 'init');
    const reviewSkill = join(repo, '.github', 'skills', 'sonorance');
    assert.ok(existsSync(join(reviewSkill, 'SKILL.md')), 'init installs the project-local /sonorance review skill');
    const reviewEngine = JSON.parse(readFileSync(join(reviewSkill, 'scripts', 'engine.json'), 'utf8')).engine;
    assert.equal(basename(reviewEngine), 'cli.mjs', 'the review skill launcher targets the Sonorance CLI');
    assert.equal(basename(dirname(reviewEngine)), 'src', 'the review skill launcher targets the Sonorance source entrypoint');
    assert.ok(existsSync(reviewEngine), 'the review skill launcher resolves an installed Sonorance engine');
    let gi = readFileSync(join(repo, '.gitignore'), 'utf8');
    assert.match(gi, /^\.sonorance\/local\/$/m, 'the machine-local .sonorance/local/ dir is ignored');
    assert.doesNotMatch(gi, /^\.sonorance\/$/m, 'the committed .sonorance/ config is NOT ignored');
    assert.match(gi, /^deliberate\/\.cache\/$/m, 'a hidden deliberate/ subfolder is ignored');
    assert.match(gi, /node_modules/, 'existing entries are preserved');
    runIn(repo, 'init');   // idempotent — no duplicate entries
    assert.ok(existsSync(join(reviewSkill, 'SKILL.md')), 're-init keeps the project-local review skill installed');
    gi = readFileSync(join(repo, '.gitignore'), 'utf8');
    assert.equal(gi.split(/\r?\n/).filter(l => l.trim() === '.sonorance/local/').length, 1, 'the entry is added at most once');
    // (b) a repo WITHOUT a .gitignore → none is created.
    runIn(bare, 'init');
    assert.ok(!existsSync(join(bare, '.gitignore')), 'no .gitignore is created when the repo has none');
  } finally { rmSync(repo, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); }
});

test('CLI resolves the project from the CURRENT folder (init takes no name → folder name)', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-cwd-'));
  // A *different* project is the stored "current" pointer — cwd resolution must win over it.
  const other = await createProject(openVault(), 'Elsewhere');
  setCurrentProject(openVault(), other.id);
  runIn(repo, 'init');
  // `source`/`case` run from the repo cwd resolve THAT repo's project, not the pointer.
  runIn(repo, 'source', 'add', '/tmp/x');
  const created = runIn(repo, 'case', 'An idea in the cwd project');
  assert.match(created.replace(/\x1B\[[0-9;]*m/g, ''), /case [0-9a-f]{6,}/, 'the case is created in the cwd project');
  assert.equal(openVault().listSources(other.id).length, 0, 'the stored-pointer project is untouched — cwd wins');
  rmSync(repo, { recursive: true, force: true });
});

test('project commands fail outside an initialized folder instead of mutating the selected vault', async () => {
  const other = await createProject(openVault(), 'SelectedElsewhere');
  setCurrentProject(openVault(), other.id);
  const uninitialized = mkdtempSync(join(tmpdir(), 'dlb-no-project-'));
  try {
    const result = resultIn(uninitialized, ['source', 'add', '/tmp/must-not-land']);
    assert.equal(result.status, 1, 'a project-required command fails outside a Deliberate vault');
    assert.match(result.stderr, /no Deliberate project in .*run deliberate init here/);
    assert.equal(openVault().listSources(other.id).length, 0, 'the globally selected vault is untouched');
  } finally {
    rmSync(uninitialized, { recursive: true, force: true });
  }
});

test('`deliberate init` scaffolds the host-edited context + competitors + ecosystem markdown', async () => {
  const store = openVault();
  const p = await createProject(store, 'CliCtx');
  setCurrentProject(store, p.id);
  // The context is a file the host authors + the user reads directly — there is no
  // `context` print command. Scaffolds exist for product.md, competitors.md, and ecosystem.md.
  store.writeContext(p.id, '# CliCtx — project context\n\n## Personas\n\n- solo founders and PMs\n');
  assert.match(openVault().readContext(p.id), /solo founders and PMs/, 'the context markdown round-trips as a file');
  assert.ok(openVault().readCompetitors(p.id).includes('Competitors'), 'a competitors.md scaffold exists for the host to fill');
  assert.ok(openVault().readEcosystem(p.id).includes('Ecosystem'), 'an ecosystem.md scaffold exists for the host to fill');
});

test('`case "<idea>"` makes the new case the latest (what analysis prompt/save act on); `case list` lists it', async () => {
  const store = openVault();
  const p = await createProject(store, 'CliActive');
  setCurrentProject(store, p.id);
  runIn(p.dir, 'case', 'First idea');
  const created = runIn(p.dir, 'case', 'Second idea', '--lens', 'market');
  // Creating a case makes it the active/latest one that analysis prompt/save default to (no `use` verb).
  assert.equal(store.getActiveCase(p.id), store.listCases(p.id)[0].id, 'creating a case makes it active');
  const listing = runIn(p.dir, 'case', 'list').replace(/\x1B\[[0-9;]*m/g, '');   // strip ANSI colour codes
  assert.match(listing, /—\s+Second idea/, 'case list lists every case');
  assert.match(listing, /—\s+First idea/, 'case list lists every case');
  assert.match(created, /market & commercial/, 'the host-selected lens is confirmed at creation');
  assert.equal(store.listCases(p.id)[0].lens, 'market', 'the selected lens is durable');
  assert.match(listing, /Second idea\s+· market & commercial/, 'case list makes the lens visible');
  assert.match(listing, /First idea\s+· product & experience/, 'unqualified cases default compatibly to Product');
});

test('case creation rejects unknown lenses and strategy cases do not offer prototypes', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-lenses-'));
  try {
    runIn(repo, 'init');
    const invalid = resultIn(repo, ['case', 'Unknown lens', '--lens', 'operations']);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Unknown case lens/);
    runIn(repo, 'case', 'Choose the next market', '--lens', 'strategy');
    const prompt = runIn(repo, 'case', 'analysis', 'prompt');
    assert.match(prompt, /\[stage: frame; lens: strategy\]/, 'analysis reports the persisted lens');
    assert.match(prompt, /## Decision lens[\s\S]*strategy & portfolio/, 'the lens grounds the prompt');
    const prototype = resultIn(repo, ['case', 'prototype', 'prompt']);
    assert.equal(prototype.status, 1);
    assert.match(prototype.stderr, /prototype is not available for strategy & portfolio cases/);
    runIn(repo, 'case', 'Simplify the Product workflow', '--lens', 'product');
    for (const command of [
      ['case', 'score', 'prompt'],
      ['case', 'one-pager', 'prompt'],
      ['case', 'prototype', 'prompt'],
    ]) {
      const incomplete = resultIn(repo, command);
      assert.equal(incomplete.status, 1, `${command.join(' ')} rejects an incomplete case`);
      assert.match(incomplete.stderr, /requires a completed case/);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('case commands reject ambiguous id prefixes instead of mutating the first match', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-ambiguous-'));
  try {
    runIn(repo, 'init');
    runIn(repo, 'case', 'First collision');
    runIn(repo, 'case', 'Second collision');
    const records = readdirSync(join(repo, 'deliberate', 'cases')).map(dir => join(repo, 'deliberate', 'cases', dir, 'analysis.md'));
    for (const [i, file] of records.entries()) {
      writeFileSync(file, readFileSync(file, 'utf8').replace(/^id:\s*.*$/m, `id: abc${i + 1}deadbeef`));
    }
    const result = resultIn(repo, ['case', 'analysis', 'prompt', 'abc']);
    assert.equal(result.status, 1, 'ambiguous references are command failures');
    assert.match(result.stderr, /ambiguous case reference "abc"/);
    assert.doesNotMatch(result.stdout, /===== TASK =====/, 'no prompt is produced for an arbitrary first match');
    const unique = resultIn(repo, ['case', 'analysis', 'prompt', 'abc1']);
    assert.equal(unique.status, 0, 'a unique prefix remains a valid shorthand');
    assert.match(unique.stdout, /===== TASK =====/);
    const missing = resultIn(repo, ['case', 'score', 'prompt', 'not-a-case']);
    assert.equal(missing.status, 1, 'missing explicit references are command failures');
    assert.match(missing.stderr, /case not found: not-a-case/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('score save requires explicit evaluator provenance before writing', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-score-provenance-'));
  const artifact = join(repo, 'score.md');
  try {
    runIn(repo, 'init');
    runIn(repo, 'case', 'A case to score');
    writeFileSync(artifact, '# Score\n\n**Score:** 7');
    const missing = resultIn(repo, ['case', 'score', 'save', '--file', artifact]);
    assert.equal(missing.status, 1, 'missing evaluator model is a command failure');
    assert.match(missing.stderr, /requires --model <actual-model-id>/);
    const p = openVault().listProjects().find((project) => project.exists && realpathSync(project.dir) === realpathSync(repo));
    const id = openVault().getActiveCase(p.id);
    assert.equal(openVault().readScore(id), null, 'no provenance-free score artifact is written');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('in-harness pipeline: case → analysis prompt/save (active case) completes the Analyst funnel; score is separate', async () => {
  const store = openVault();
  const p = await createProject(store, 'InHarness');
  setCurrentProject(store, p.id);
  runIn(p.dir, 'case', 'Bulk archive stale mail');   // creates + makes active
  const id = store.getActiveCase(p.id);

  // `case analysis prompt` acts on the active case: grounding + instructions + context + template.
  const framePrompt = runIn(p.dir, 'case', 'analysis', 'prompt');
  assert.match(framePrompt, /^MODEL: /m, 'analysis prompt prints the stage MODEL line');
  assert.match(framePrompt, /===== SYSTEM =====/, 'prompt has a SYSTEM block');
  assert.match(framePrompt, /===== TASK =====/, 'prompt has a TASK block (context + template)');
  assert.match(framePrompt, /\[stage: frame; lens: product\]/, 'a fresh case starts at frame with the compatible Product default');

  // The host produces each analysis stage; stand in with a stub artifact and `save` it (active case).
  const artFile = join(tmpdir(), `dlb-art-${id}.md`);
  let last;
  for (const st of ['frame', 'shape', 'launch']) {
    writeFileSync(artFile, `# ${st}\n\nGrounded artifact.`);
    last = runIn(p.dir, 'case', 'analysis', 'save', '--file', artFile);
    assert.match(last, new RegExp(`saved ${st}`), `${st} persisted`);
  }
  assert.match(last, /analysis complete/, 'saving the last funnel stage (launch) completes the analysis');
  assert.equal(store.getCase(id).state, 'done', 'state is done after launch (no prototype state, no gate)');

  // The decorrelated Evaluator's score is a SEPARATE, recomputable artifact (score.md), not a stage.
  const scorePrompt = runIn(p.dir, 'case', 'score', 'prompt');
  assert.match(scorePrompt, /Evaluator/, 'the score prompt isolates a cross-vendor Evaluator');
  writeFileSync(artFile, '# Score\n\n**Score:** 7.5\n- reason one\n- reason two');
  const scoreSaved = runIn(p.dir, 'case', 'score', 'save', '--model', 'gpt-5.4', '--independent', '--file', artFile);
  assert.match(scoreSaved, /saved score/, 'score save confirms');
  assert.equal(store.getCase(id).score, 7.5, 'the decorrelated Evaluator score is stamped on the case');
  assert.match(store.readScore(id), /Evaluation provenance:[\s\S]*Independent evaluator[\s\S]*gpt-5\.4/, 'score.md visibly records the independent evaluator');
  assert.match(readFileSync(store.recordFile(id), 'utf8'), /## Score[\s\S]*score\.md/, 'analysis.md links the score');

  // The prototype is a recomputable companion the host builds on request (never auto-run).
  writeFileSync(artFile, '# Prototype\n\n```html\n<!DOCTYPE html><html><body><h1>proto</h1></body></html>\n```');
  const protoSaved = runIn(p.dir, 'case', 'prototype', 'save', id, '--file', artFile);
  assert.match(protoSaved, /saved prototype/, 'prototype save confirms');
  assert.equal(store.getCase(id).state, 'done', 'building the prototype does not change the case state');
  assert.match(store.readStage(p.id, id, 'prototype', 'index.html'), /<h1>proto<\/h1>/, 'the prototype index.html is written in-harness');
  assert.match(readFileSync(store.recordFile(id), 'utf8'), /## Prototype[\s\S]*prototype\/index\.html/, 'analysis.md links the prototype');
  // A named PRIMARY surface nests under prototype/<surface>/index.html; `prototype list` reports both.
  writeFileSync(artFile, '# Prototype\n\n```html\n<!DOCTYPE html><html><body><pre>$ deliberate</pre></body></html>\n```');
  const cliSaved = runIn(p.dir, 'case', 'prototype', 'save', id, '--surface', 'cli', '--file', artFile);
  assert.match(cliSaved, /saved prototype \(cli\)[\s\S]*prototype\/cli\/index\.html/, 'a --surface save reports the nested path');
  assert.match(store.readStage(p.id, id, 'prototype', 'cli/index.html'), /\$ deliberate/, 'the cli surface prototype nests under prototype/cli/');
  const listed = runIn(p.dir, 'case', 'prototype', 'list', id);
  assert.match(listed, /cli/, 'prototype list shows the cli surface');
  rmSync(artFile, { force: true });
});

test('CLI `case one-pager prompt|save` writes the one-pager (internal reverse PR-FAQ) beside analysis.md and links it', async () => {
  const store = openVault();
  const p = await createProject(store, 'CliOnePager');
  setCurrentProject(store, p.id);
  runIn(p.dir, 'case', 'Let users export their data to CSV');
  const id = store.getActiveCase(p.id);
  // Complete the analysis so the one-pager has a finished record to distil.
  const artFile = join(tmpdir(), `dlb-op-art-${id}.md`);
  for (const st of ['frame', 'shape', 'launch']) {
    writeFileSync(artFile, `# ${st}\n\nGrounded ${st}.`);
    runIn(p.dir, 'case', 'analysis', 'save', '--file', artFile);
  }
  // `case one-pager prompt` prints the producer prompt grounded in the record.
  const prompt = runIn(p.dir, 'case', 'one-pager', 'prompt');
  assert.match(prompt, /^MODEL: /m, 'one-pager prompt prints a MODEL line');
  assert.match(prompt, /## The customer's story/, 'one-pager prompt carries the one-pager template');
  assert.match(prompt, /## launch/, 'one-pager prompt grounds on the finished record');
  // `case one-pager save` writes one-pager.md and links it from analysis.md.
  writeFileSync(artFile, '# Export in one click\n\nFor busy teams.\n\n## The customer\'s story\n\nI used to dread month-end.\n\n## FAQ\n\n**Who is this for?**\nTeams.');
  const saved = runIn(p.dir, 'case', 'one-pager', 'save', '--file', artFile);
  assert.match(saved, /saved one-pager/, 'one-pager save confirms');
  assert.ok(store.readOnepager(id) && /Export in one click/.test(store.readOnepager(id)), 'the one-pager is readable from the case folder');
  assert.match(readFileSync(store.recordFile(id), 'utf8'), /## One-pager[\s\S]*one-pager\.md/, 'analysis.md links the one-pager');
  rmSync(artFile, { force: true });
});

test('`serve` serves the vault of the folder it is launched from (not the stored pointer)', async () => {
  // A different project is the stored "current" pointer; serve must ignore it and
  // serve the folder it's launched in (the regression: it used the pointer).
  const other = await createProject(openVault(), 'ServeElsewhere');
  setCurrentProject(openVault(), other.id);
  const repoB = mkdtempSync(join(tmpdir(), 'dlb-serve-'));
  runIn(repoB, 'init');
  runIn(repoB, 'case', 'Bravo idea worth serving');
  const port = 8100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [cli, 'serve', '--port', String(port)], { cwd: repoB, env: process.env, stdio: 'ignore' });
  try {
    let state;
    for (let i = 0; i < 60 && !state; i++) {
      try { state = await (await fetch(`http://localhost:${port}/api/state`)).json(); }
      catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert.ok(state && state.project, 'the daemon came up and resolved a project');
    assert.equal(realpathSync(state.project.dir), realpathSync(repoB), 'serves the launch folder, not the stored current project');
    assert.ok(state.cases.some(s => s.title === 'Bravo idea worth serving'), "shows the launch folder's cases");
  } finally {
    child.kill('SIGTERM');
    rmSync(repoB, { recursive: true, force: true });
  }
});

test('`deliberate serve` gitignores machine state (.sonorance/local/ + hidden deliberate/ subfolders) on boot', async () => {
  // A Deliberate vault (has deliberate/) with a .gitignore + a hidden subfolder, but NOT `init`'d —
  // so this proves SERVE (not init) keeps machine state out of git the moment it opens the project.
  const repo = mkdtempSync(join(tmpdir(), 'dlb-servegi-'));
  mkdirSync(join(repo, 'deliberate', 'context'), { recursive: true });
  mkdirSync(join(repo, 'deliberate', '.cache'), { recursive: true });
  writeFileSync(join(repo, '.gitignore'), 'node_modules\n');
  const port = 8100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, [cli, 'serve', '--port', String(port)], { cwd: repo, env: process.env, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://localhost:${port}/api/state`)).json(); break; }
      catch { await new Promise(r => setTimeout(r, 100)); }
    }
    const gi = readFileSync(join(repo, '.gitignore'), 'utf8');
    assert.match(gi, /^\.sonorance\/local\/$/m, 'serve ignored the machine-local .sonorance/local/ dir');
    assert.doesNotMatch(gi, /^\.sonorance\/$/m, 'the committed .sonorance/ config is NOT ignored');
    assert.match(gi, /^deliberate\/\.cache\/$/m, 'serve ignored a hidden deliberate/ subfolder');
    assert.match(gi, /node_modules/, 'existing entries are preserved');
  } finally {
    child.kill('SIGTERM');
    rmSync(repo, { recursive: true, force: true });
  }
});

test('CLI `comment list` + `comment <id> resolve` carry in-record comments to the agent and resolve them back (comment bridge)', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-bridge-'));
  runIn(repo, 'init');
  runIn(repo, 'case', 'A case to comment on');
  const child = spawn(process.execPath, [cli, 'serve', '--port', '0'], { cwd: repo, env: process.env, stdio: 'ignore' });
  try {
    const infoPath = join(realpathSync(repo), '.sonorance', 'local', 'serve.json');
    let state, port;
    for (let i = 0; i < 100 && !state; i++) {
      try {
        if (!port && existsSync(infoPath)) port = JSON.parse(readFileSync(infoPath, 'utf8')).port;
        if (port) state = await (await fetch(`http://localhost:${port}/api/state`)).json();
      }
      catch { /* retry until the startup deadline */ }
      if (!state) await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(state, 'the app becomes reachable through its serve.json discovery pointer');
    const caseId = state.cases[0].id;
    // The app knows the record's file (from /api/record); the browser comments on it.
    const rec = await (await fetch(`http://localhost:${port}/api/record?id=${caseId}`)).json();
    const c = await (await fetch(`http://localhost:${port}/api/comment`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: rec.file, quote: 'the problem', heading: 'Frame', body: 'Is this grounded?' }),
    })).json();
    assert.ok(c.commentId, 'comment persisted');
    // serve recorded its bound port so a session in the project folder finds it WITHOUT
    // --port (the fix for non-default-port / multi-instance skew).
    assert.ok(existsSync(infoPath), 'serve wrote a serve.json pointer');
    assert.equal(JSON.parse(readFileSync(infoPath, 'utf8')).port, port, 'serve.json records the bound port');
    // The harness fetches the open comments with NO --port → it resolves the port from serve.json.
    const batch = JSON.parse(runIn(repo, 'comment', 'list').trim());
    assert.equal(batch.count, 1);
    const item = batch.comments.find(x => x.id === c.commentId);
    assert.ok(item, 'the open comment is in the batch');
    assert.equal(item.body, 'Is this grounded?');
    assert.ok(item.file && !item.file.startsWith('/'), 'the batch names the file to edit (project-relative)');
    const missing = resultIn(repo, ['comment', 'missing', 'resolve']);
    assert.equal(missing.status, 1, 'server-reported failures remain command failures');
    assert.match(missing.stderr, /resolve failed:/);
    // The harness resolves it by id (also port-file-resolved) → it lands on the durable comment.
    const out = runIn(repo, 'comment', item.id, 'resolve', '--revised', '--note', 'tightened it');
    assert.match(out, /resolved comment/);
    const { comments } = await (await fetch(`http://localhost:${port}/api/comments?file=${encodeURIComponent(rec.file)}`)).json();
    assert.equal(comments[0].status, 'resolved');
    assert.equal(comments[0].revised, true);
    assert.equal(comments[0].note, 'tightened it');
  } finally {
    child.kill('SIGTERM');
    rmSync(repo, { recursive: true, force: true });
  }
});

test('comment bridge refuses an uninitialized folder or an app serving a different project', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-bridge-local-'));
  const other = mkdtempSync(join(tmpdir(), 'dlb-bridge-other-'));
  const outside = mkdtempSync(join(tmpdir(), 'dlb-bridge-outside-'));
  const otherHome = mkdtempSync(join(tmpdir(), 'dlb-bridge-home-'));
  const otherEnv = { ...process.env, SONORANCE_HOME: otherHome };
  runIn(repo, 'init');
  assert.equal(resultIn(other, ['init'], otherEnv).status, 0);
  const child = spawn(process.execPath, [cli, 'serve', '--port', '0'], { cwd: other, env: otherEnv, stdio: 'ignore' });
  try {
    const noProject = resultIn(outside, ['comment', 'list']);
    assert.equal(noProject.status, 1, 'comments require the initialized current folder');
    assert.match(noProject.stderr, /no Deliberate project/);

    const infoPath = join(realpathSync(other), '.sonorance', 'local', 'serve.json');
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { if (existsSync(infoPath)) port = JSON.parse(readFileSync(infoPath, 'utf8')).port; }
      catch { /* retry until startup */ }
      if (!port) await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(port, 'the other project app becomes reachable');
    const wrongServerEnv = { ...process.env, DELIBERATE_PORT: String(port) };
    for (const args of [['comment', 'list'], ['comment', 'missing', 'resolve']]) {
      const result = resultIn(repo, args, wrongServerEnv);
      assert.equal(result.status, 1, `${args.join(' ')} rejects the wrong app`);
      assert.match(result.stderr, /project check failed/, 'the mismatch is surfaced explicitly');
    }
  } finally {
    child.kill('SIGTERM');
    rmSync(repo, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    rmSync(otherHome, { recursive: true, force: true });
  }
});

test('comment bridge transport failures are nonzero errors, never empty-success payloads', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-bridge-offline-'));
  try {
    runIn(repo, 'init');
    const env = { ...process.env, DELIBERATE_PORT: '1' };
    const list = resultIn(repo, ['comment', 'list'], env);
    assert.equal(list.status, 1);
    assert.match(list.stderr, /could not reach the app/);
    assert.doesNotMatch(list.stdout, /"count":0/, 'transport failure is not represented as an empty comment batch');
    const resolve = resultIn(repo, ['comment', 'missing', 'resolve'], env);
    assert.equal(resolve.status, 1);
    assert.match(resolve.stderr, /could not reach the app/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('CLI `brief prompt` prints the reporting window + template for the host to fulfill', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-brief-'));
  runIn(repo, 'init');
  const out = runIn(repo, 'brief', 'prompt');
  assert.match(out, /produce in THIS session/, 'the host produces the brief itself (no sub-agent line)');
  assert.match(out, /Reporting window \(STRICT\)/, 'the strict window is stated');
  assert.match(out, /last 3 months/, 'a first-ever brief caps at 3 months');
  assert.match(out, /OUTPUT TEMPLATE/, 'the brief template is appended');
  rmSync(repo, { recursive: true, force: true });
});

test('CLI `brief save` persists a brief to disk and `brief list` lists it', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-brief2-'));
  runIn(repo, 'init');
  const body = '# Brief\n\nPeriod: test window.\n\n## Key highlights\n\n* Acme shipped X. [Source](https://acme.example)\n';
  const saved = execFileSync(process.execPath, [cli, 'brief', 'save'], { cwd: repo, env: process.env, encoding: 'utf8', input: body });
  assert.match(saved.replace(/\x1B\[[0-9;]*m/g, ''), /saved brief [0-9a-f]{6,}/, 'the saved brief prints its hash id');
  const list = runIn(repo, 'brief', 'list');
  assert.match(list, /briefs ·/, 'brief list lists under the project');
  assert.match(list.replace(/\x1B\[[0-9;]*m/g, ''), /[0-9a-f]{6,}/, 'the brief is listed by its hash id');
  // The brief is a plain file the user reads directly / opens in the app — verify it landed.
  const bdir = join(realpathSync(repo), 'deliberate', 'briefs');
  const md = readFileSync(join(bdir, readdirSync(bdir)[0], 'brief.md'), 'utf8');
  assert.match(md, /Acme shipped X/, 'the brief body persisted to disk');
  rmSync(repo, { recursive: true, force: true });
});

test('CLI `readout prompt|chart|save|list` renders and persists a chart bundle', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-readout-'));
  runIn(repo, 'init');
  runIn(repo, 'source', 'add', 'https://metrics.example', 'Product metrics', '--section', 'metrics-data');
  const prompt = runIn(repo, 'readout', 'prompt');
  assert.match(prompt, /you are the Reporter/, 'the host produces the readout as Reporter');
  assert.match(prompt, /FIRST readout/, 'a first readout receives an explicit completed reporting period');
  assert.match(prompt, /default previous completed calendar week/i);
  assert.match(prompt, /Metrics & data/, 'the categorized metric source is injected');
  assert.match(prompt, /OUTPUT TEMPLATE/, 'the concise readout template is appended');
  const bundle = join(repo, 'tmp-readout');
  const charts = join(bundle, 'charts');
  mkdirSync(charts, { recursive: true });
  const spec = join(bundle, 'weekly.json');
  writeFileSync(spec, JSON.stringify({
    title: 'Weekly activation',
    unit: 'activated users',
    comparison: 'WoW',
    source: 'https://metrics.example',
    series: [
      { period_start: '2026-06-01', period_end: '2026-06-07', value: 8 },
      { period_start: '2026-06-08', period_end: '2026-06-14', value: 9 },
      { period_start: '2026-06-15', period_end: '2026-06-21', value: 11 },
      { period_start: '2026-06-22', period_end: '2026-06-28', value: 12 },
    ],
  }));
  const chart = join(charts, 'weekly-activation.svg');
  assert.match(runIn(repo, 'readout', 'chart', '--spec', spec, '--output', chart), /saved chart/);
  const body = '# Product readout\n\nPeriod: June 1, 2020 – June 30, 2020\n\n## Key metrics\n\n![Weekly activation over four completed weeks](charts/weekly-activation.svg)\n\n## Key takeaways\n\n- Activation rose. [Source](https://metrics.example)\n';
  writeFileSync(join(bundle, 'readout.md'), body);
  const saved = runIn(repo, 'readout', 'save', '--bundle', bundle, '--period-start', '2020-06-01', '--period-end', '2020-06-30', '--timezone', 'America/Chicago');
  assert.match(saved.replace(/\x1B\[[0-9;]*m/g, ''), /saved readout [0-9a-f]{6,}.*1 chart/);
  assert.match(runIn(repo, 'readout', 'list'), /readouts ·/);
  const dir = join(realpathSync(repo), 'deliberate', 'readouts');
  const savedDir = join(dir, readdirSync(dir)[0]);
  assert.match(readFileSync(join(savedDir, 'readout.md'), 'utf8'), /charts\/weekly-activation\.svg/);
  assert.match(readFileSync(join(savedDir, 'charts', 'weekly-activation.svg'), 'utf8'), /data-deliberate-chart="1"/);
  rmSync(repo, { recursive: true, force: true });
});

test('CLI `init prompt` injects the Initiator method + the context scaffolds for the host to fill', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dlb-initp-'));
  runIn(repo, 'init');
  const promptStore = openVault();
  const project = promptStore.listProjects().find(candidate => existsSync(candidate.dir) && realpathSync(candidate.dir) === realpathSync(repo));
  assert.ok(project, 'the initialized repo is registered as a project');
  const localSource = join(repo, 'do-not-attach-local.md');
  writeFileSync(localSource, 'automatic local grounding');
  promptStore.addSource(project.id, localSource, 'Legacy local entry', 'other');
  promptStore.addSource(project.id, 'https://example.com/init-source', 'External init source', 'other');
  promptStore.close();
  const out = runIn(repo, 'init', 'prompt');
  assert.match(out, /you are the Initiator/, 'the host produces the context itself (Initiator)');
  assert.match(out, /files inside this project directly/i, 'project files are read as automatic context');
  assert.match(out, /Attached external sources:/);
  assert.match(out, /https:\/\/example\.com\/init-source/, 'external sources remain attached');
  assert.doesNotMatch(out, /do-not-attach-local\.md/, 'legacy in-project source entries are not injected');
  assert.match(out, /\bEcosystem\b/, 'the injected method covers the Ecosystem section');
  assert.match(out, /deliberate\/context\/product\.md/, 'the task points at the product.md file to edit');
  const readme = readFileSync(join(repo, 'README.md'), 'utf8');
  assert.match(readme, /Product context for agents/);
  assert.match(readme, /deliberate\/context\//);
  assert.match(out, /deliberate\/context\/competitors\.md/, 'and the competitors.md file');
  assert.match(out, /deliberate\/context\/ecosystem\.md/, 'and the ecosystem.md file');
  rmSync(repo, { recursive: true, force: true });
});
