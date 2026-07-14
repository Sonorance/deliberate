#!/usr/bin/env node
/**
 * deliberate — Deliberate CLI. Local-first, files-first product-decision pipeline.
 * The project is simply the folder the harness runs in (its `deliberate/` folder).
 *
 * The command surface is the SINGLE SOURCE OF TRUTH in src/engine/commands.mjs
 * (CLI_COMMANDS + SKILL_COMMANDS); `help` renders the engine grammar, while
 * `help --skill` renders the user-facing /deliberate grammar. Tests keep both
 * outputs, the generated docs, and this dispatcher in sync.
 */
import { openVault } from 'sonorance/plugins/deliberate/vault.mjs';
import { setCurrentProject, openProjectVault, stagePrompt, persistStage, onepagerPrompt, persistOnepager, scorePrompt, persistScore, prototypePrompt, persistPrototype, briefPrompt, persistBrief, briefPeriodLabel, readoutPrompt, persistReadout, readoutPeriodLabel, renderTrendChartFile, loadReadoutCharts, matchupPrompt, persistMatchup, matchupAsOfLabel, initPrompt } from '../engine/service.mjs';
import { STAGES } from 'sonorance/plugins/deliberate/stages.mjs';
import { scoreClass, STATE } from 'sonorance/plugins/deliberate/domain.mjs';
import { CLI_COMMANDS, SKILL_COMMANDS } from '../engine/commands.mjs';
import { serveInfoPath } from 'sonorance/plugins/deliberate/paths.mjs';
import { configureTelemetry, emit, shutdownTelemetry } from 'sonorance/telemetry.mjs';
import { ensureInstallId } from 'sonorance/identity.mjs';
import { submitFeedback } from 'sonorance/feedback.mjs';
import { CommentClientError, fetchCommentBatch, fetchCommentProject, resolveComment } from 'sonorance/comment-client.mjs';
import { buildLaunchUrl } from 'sonorance/launch-url';
import { installSonoranceSkill } from 'sonorance/skill-installer';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, realpathSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { vaultIgnoreEntries } from 'sonorance/plugins/deliberate/gitignore.mjs';
import { caseLens, caseLensLabel, requireCaseLens, supportsPrototype } from '../engine/lenses.mjs';
import { externalSources, isExternalSource } from '../engine/sources.mjs';

const c = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', d: '\x1b[90m', w: '\x1b[1m', x: '\x1b[0m' };
const sc = (n) => n == null ? '—' : c[scoreClass(n)] + n.toFixed(1) + c.x;
const VERDICT = { g: 'go', y: 'lean', r: 'no-go' };
const verdictOf = (n) => n == null ? null : VERDICT[scoreClass(n)];
const P = (...a) => console.log(...a);
class CliError extends Error {}

// Assigned in main() so the module can be imported (by tests) without running or
// touching ~/.sonorance — the handlers reference these lazily, at call time.
let store, A;

const setLast = (id) => setCurrentProject(store, id);
// The project is exactly the folder the harness is running in. Never fall back to
// another globally selected vault: a command from the wrong cwd must not mutate it.
const canonicalDir = (dir) => { try { return realpathSync(dir); } catch { return resolve(dir); } };
const curProject = () => {
  const cwd = canonicalDir(process.cwd());
  return store.listProjects().find(p => canonicalDir(p.dir) === cwd) || null;
};
const requireProject = () => {
  const p = curProject();
  if (!p) throw new CliError(`no Deliberate project in ${process.cwd()} — run deliberate init here`);
  return p;
};

const opt = (flag) => { const i = A.indexOf(flag); return i >= 0 ? A[i + 1] : null; };

// Add ignore `entries` to `<root>/.gitignore` — but ONLY if that file already exists (we never
// create one). Idempotent (an entry already present, with or without a trailing slash, is skipped).
// Returns the entries actually added. Machine state (the platform `.sonorance/` and any hidden
// dot-subfolder a skill writes under `deliberate/`) shouldn't be committed.
const ensureGitignore = (root, entries) => {
  const gi = join(root, '.gitignore');
  if (!existsSync(gi)) return [];
  const txt = readFileSync(gi, 'utf8');
  const present = new Set(txt.split(/\r?\n/).map(l => l.trim().replace(/\/+$/, '')).filter(Boolean));
  const missing = entries.filter(e => !present.has(e.replace(/\/+$/, '')));
  if (!missing.length) return [];
  writeFileSync(gi, txt + (txt === '' || txt.endsWith('\n') ? '' : '\n') + missing.join('\n') + '\n');
  return missing;
};
// A user (and the skill) address a case by its internal hash id (or an unambiguous id
// prefix). There is no sequential number — the id is the only handle.
const resolveCase = (pid, ref) => {
  if (ref == null) return null;
  const r = String(ref), list = store.listCases(pid);
  const exact = list.find(s => s.id === r);
  if (exact) return exact.id;
  const matches = list.filter(s => s.id.startsWith(r));
  if (matches.length === 1) return matches[0].id;
  if (!matches.length) throw new CliError(`case not found: ${r}`);
  throw new CliError(`ambiguous case reference "${r}" — matches ${matches.map(s => s.id).join(', ')}; use a longer prefix`);
};
// The case a stage command acts on: an explicit trailing ref (id; not a flag), else the active case.
const targetCase = (pid, maybeRef) => {
  const ref = (maybeRef != null && !String(maybeRef).startsWith('-')) ? maybeRef : null;
  const id = ref != null ? resolveCase(pid, ref) : store.getActiveCase(pid);
  return id != null ? store.getCase(id) : undefined;
};
const readStdin = () => new Promise(res => { if (process.stdin.isTTY) return res(''); let d = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', ch => d += ch); process.stdin.on('end', () => res(d)); });
const provisionalTitle = (s) => s ? s.split(/\s+/).slice(0, 6).join(' ').slice(0, 60) : 'Untitled';
const relDays = (ts) => { if (!ts) return ''; const d = Math.floor((Date.now() - ts) / 86400000); return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`; };
const firstArg = (r) => r.find(x => !x.startsWith('--')) ?? '';
// Open a URL in the user's default browser (`serve --open`). Best-effort, cross-platform.
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* ignore */ }
}
// The analysis funnel (frame → shape → launch) the in-harness skill drives one stage at a
// time; the decorrelated score and the clickable prototype are separate, recomputable
// companions (deliberate case score / case prototype), not part of the funnel.
// The running app daemon (deliberate serve) that the comment bridge talks to.
// `address` and `resolve` are HTTP clients of it — the agent (this harness) and the
// browser meet through that local server. Port resolution: --port, else $DELIBERATE_PORT,
// else the port `serve` recorded for THIS project's vault (deliberate/.config/serve.json),
// else the default — so a session in the project folder reaches the right server.
const daemonPort = () => {
  if (opt('--port')) return +opt('--port');
  if (process.env.DELIBERATE_PORT) return +process.env.DELIBERATE_PORT;
  try { const p = curProject(); if (p) { const info = JSON.parse(readFileSync(serveInfoPath(p.dir), 'utf8')); if (info && info.port && pidAlive(info.pid)) return +info.port; } } catch { /* no pointer */ }
  return 7777;
};
// A recorded server is only trustworthy if still alive: probe with `process.kill(pid, 0)` (no
// signal sent). Lenient — only a definitively-dead pid (ESRCH) is rejected, so a stale serve.json
// from a crashed server no longer points `address`/`resolve` at a dead port; a missing pid is trusted.
const pidAlive = (pid) => { if (!Number.isInteger(pid)) return true; try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
const commentTarget = async () => {
  const p = requireProject();
  const port = daemonPort();
  const unavailable = `could not reach the app on port ${port} — is it running? (deliberate serve)`;
  const base = `http://localhost:${port}`;
  const project = await fetchCommentProject(`${base}/api/state?project=${encodeURIComponent(p.id)}`, unavailable);
  if (canonicalDir(project.dir) !== canonicalDir(p.dir)) {
    throw new CommentClientError(`project check failed: app on port ${port} is serving a different project`);
  }
  return { p, base, unavailable };
};
// This checkout's version (for the serve pointer / stale-server detection). Best-effort.
const pkgVersion = () => { try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'), 'utf8')).version || '0'; } catch { return '0'; } };
export const installEngineConfig = (repoRoot, engineFile, version = pkgVersion()) =>
  existsSync(join(repoRoot, '.git'))
    ? { engine: engineFile }
    : { package: 'deliberate-cli', version };

// ---- `case` sub-handlers (noun-first; the parent dispatcher routes to these) ----
// Create a case (no run) and make it the active case; the skill then loops analysis
// prompt → (produce in-harness) → save per stage.
function caseNew(p, r) {
  const idea = firstArg(r); if (!idea) return P('usage: deliberate case "<idea>"');
  const lens = requireCaseLens(opt('--lens') || 'product');
  const s = store.createCase(p.id, opt('--title') || provisionalTitle(idea), idea, { lens });
  if (s?.lens !== lens) {
    if (typeof store.deleteCase === 'function') store.deleteCase(s.id);
    throw new CliError('Installed Sonorance does not support case lenses; upgrade the sonorance dependency');
  }
  store.setActiveCase(p.id, s.id);
  emit('case.created', { lens });
  P(`case ${c.w}${s.id}${c.x} · ${s.slug} · ${caseLensLabel(lens)} ${c.d}(active)${c.x}`);
  P(`stages: ${STAGES.join(' → ')}  ${c.d}(score after analysis; eligible prototype on request)${c.x}`);
  P(`next: ${c.w}deliberate case analysis prompt${c.x}`);
}
// List cases and scores (active marked *).
function caseList(p) {
  const active = store.getActiveCase(p.id);
  const list = store.listCases(p.id, { min: opt('--min') ? +opt('--min') : null, state: opt('--state') });
  return P(`cases · ${p.name}\n` + (list.map(s => `  ${s.id === active ? c.g + '*' + c.x : ' '} ${c.w}${s.id}${c.x} ${sc(s.score)}  ${s.title} ${c.d}· ${caseLensLabel(caseLens(s))} · ${s.state}${c.x}`).join('\n') || '  (none — deliberate case "<idea>")'));
}
// The next analysis stage to run for a case, inferred from its state (the skill never
// passes a stage token): a new case starts at frame; a mid-funnel case runs its pending
// stage; once launch is saved (state done) the analysis is complete.
const analysisStage = (kase) => {
  const st = kase.state;
  if (st === STATE.NEW) return STAGES[0];
  return STAGES.includes(st) ? st : null;
};
// `case analysis prompt|save [id]` — walk the analysis funnel (frame → shape → launch),
// one stage at a time, inferring the stage from the case's state.
async function caseAnalysis(p, action, args) {
  const kase = targetCase(p.id, args[0]);
  if (!kase) return P('no case — create one with deliberate case "<idea>"');
  const stage = analysisStage(kase);
  if (!stage) return P(`${c.d}analysis complete for ${kase.id} — next:${c.x} ${c.w}deliberate case score prompt${c.x}`);
  if (action === 'prompt') {
    const { system, user, lens } = await stagePrompt(store, p, kase, stage, opt('--note'));
    return P(`MODEL: (produce in THIS session — you are the Analyst; no sub-agent) ${c.d}[stage: ${stage}; lens: ${lens}]${c.x}\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
  }
  if (action === 'save') {
    const art = opt('--file') ? readFileSync(opt('--file'), 'utf8') : await readStdin();
    if (!art.trim()) return P('usage: deliberate case analysis save [id] --file <path>  (or pipe via stdin)');
    const rr = await persistStage(store, p, kase.id, stage, art);
    const lens = caseLens(kase);
    emit('case.stage.completed', { stage, lens });
    if (!rr.next) emit('case.completed', { lens });
    return P(`saved ${stage} → ${rr.next || c.g + 'analysis complete' + c.x + c.d + ' (score the finished recommendation next)' + c.x}`);
  }
  return P('usage: deliberate case analysis <prompt|save> [id]');
}
// `case score prompt|save [id]` — the decorrelated Evaluator's recomputable verdict
// (score.md). `prompt` prints the target Evaluator MODEL line; `save` records the
// actual model and whether an isolated evaluator produced the result.
async function caseScore(p, action, args) {
  const kase = targetCase(p.id, args[0]);
  if (!kase) return P('no case — create one with deliberate case "<idea>"');
  if (action === 'prompt') {
    const { system, user, model } = await scorePrompt(store, p, kase);
    return P(`MODEL: ${model}  (Evaluator — spawn an ISOLATED sub-agent on this cross-vendor model)\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
  }
  if (action === 'save') {
    const model = opt('--model');
    if (!model) throw new CliError('case score save requires --model <actual-model-id>; add --independent only for an isolated evaluator');
    if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)) throw new CliError('--model must be a model id using letters, numbers, dot, underscore, colon, slash, or hyphen');
    const art = opt('--file') ? readFileSync(opt('--file'), 'utf8') : await readStdin();
    if (!art.trim()) return P('usage: deliberate case score save [id] --model <actual-model-id> [--independent] --file <path>  (or pipe via stdin)');
    const refreshed = kase.score != null;
    const independent = A.includes('--independent');
    const rr = await persistScore(store, p, kase, art, { model, independent });
    if (rr.score != null) emit('case.scored', { verdict: verdictOf(rr.score), refreshed, independent, lens: caseLens(kase) });
    return P(`saved score${rr.score != null ? ` · ${sc(rr.score)}` : ''} · ${independent ? 'independent evaluator' : 'same-session fallback'} → deliberate/cases/.../score.md`);
  }
  return P('usage: deliberate case score <prompt|save> [id]');
}
// `case one-pager prompt|save [id]` — the lens-appropriate decision one-pager
// companion beside analysis.md (CLI-only, host-internal; not on the skill surface).
async function caseOnepager(p, action, args) {
  const kase = targetCase(p.id, args[0]);
  if (!kase) return P('no case — create one with deliberate case "<idea>"');
  if (action === 'prompt') {
    const { system, user } = await onepagerPrompt(store, p, kase);
    return P(`MODEL: (produce in THIS session — you are the Analyst; distil the finished record)\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
  }
  if (action === 'save') {
    const art = opt('--file') ? readFileSync(opt('--file'), 'utf8') : await readStdin();
    if (!art.trim()) return P('usage: deliberate case one-pager save [id] --file <path>  (or pipe via stdin)');
    const { file } = await persistOnepager(store, p, kase, art);
    return P(`saved one-pager → deliberate/cases/.../one-pager.md ${c.d}(${file?.exists ? 'written' : 'saved'})${c.x}`);
  }
  return P('usage: deliberate case one-pager <prompt|save> [id]');
}
// `case prototype prompt|save|list [id] [--surface <slug>]` — build the clickable/recomputable
// prototype(s), a companion built on request (never auto-run), like the score. A case can hold
// one prototype per PRIMARY surface (init marks them): `--surface <slug>` targets one; omitting it
// builds the single default surface at `prototype/index.html`.
async function caseProto(p, action, args) {
  const kase = targetCase(p.id, args[0]);
  if (!kase) return P('no case — create one with deliberate case "<idea>"');
  const surface = opt('--surface') || '';
  if (action === 'list') {
    const built = store.listPrototypes(kase.id);
    return P(built.length
      ? built.map(b => `${b.surface || c.d + '(default)' + c.x} ${c.d}→ ${b.rel}${c.x}`).join('\n')
      : `${c.d}no prototype yet — build one with${c.x} deliberate case prototype prompt ${kase.id}`);
  }
  if (!supportsPrototype(caseLens(kase))) {
    throw new CliError(`prototype is not available for ${caseLensLabel(caseLens(kase))} cases`);
  }
  if (action === 'prompt') {
    const { system, user } = await prototypePrompt(store, p, kase, surface);
    return P(`MODEL: (produce in THIS session — you are the Prototyper; no sub-agent)\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
  }
  if (action === 'save') {
    const art = opt('--file') ? readFileSync(opt('--file'), 'utf8') : await readStdin();
    if (!art.trim()) return P('usage: deliberate case prototype save [id] [--surface <slug>] --file <path>  (or pipe via stdin)');
    const { file, surface: slug } = await persistPrototype(store, p, kase, art, surface);
    emit('prototype.built', { surface: slug || 'default', lens: caseLens(kase) });
    const rel = `prototype/${slug ? slug + '/' : ''}index.html`;
    return P(`saved prototype${slug ? ` (${slug})` : ''} → deliberate/cases/.../${rel} ${c.d}(${file?.exists ? 'written' : 'saved'})${c.x}`);
  }
  return P('usage: deliberate case prototype <prompt|save|list> [id] [--surface <slug>]');
}
// List the project's briefs (newest first; delete one by removing its folder).
function briefList(p) {
  const list = store.listBriefs(p.id);
  return P(`briefs · ${p.name}\n` + (list.map(b => `  ${c.w}${b.id}${c.x} ${briefPeriodLabel(b.period_start, b.period_end)} ${c.d}· ${relDays(b.created_at)}${c.x}`).join('\n') || '  (none — deliberate brief prompt, then deliberate brief save)'));
}
// List the project's product readouts (newest first; delete one by removing its folder).
function readoutList(p) {
  const list = store.listReadouts(p.id);
  return P(`readouts · ${p.name}\n` + (list.map(r => `  ${c.w}${r.id}${c.x} ${readoutPeriodLabel(r.period_start, r.period_end)} ${c.d}· ${relDays(r.created_at)}${c.x}`).join('\n') || '  (none — deliberate readout prompt, then deliberate readout save)'));
}
// List the project's matchups (one per rival; newest first; delete one by removing its folder).
function matchupList(p) {
  const list = store.listMatchups(p.id);
  return P(`matchups · ${p.name}\n` + (list.map(m => `  ${c.w}${m.id}${c.x} ${m.competitor || m.slug} ${c.d}· as of ${matchupAsOfLabel(m.as_of || m.updated_at)} · ${relDays(m.updated_at)}${c.x}`).join('\n') || '  (none — deliberate matchup prompt <competitor>, then deliberate matchup save <competitor>)'));
}
// Fetch the open in-record comments from the running app (JSON-only, for the harness) —
// the read half of the comment bridge (`comment <id> resolve` is the write half).
async function commentList() {
  const { p, base, unavailable } = await commentTarget();
  const j = await fetchCommentBatch(
    `${base}/api/address?project=${encodeURIComponent(p.id)}`,
    unavailable,
  );
  return P(JSON.stringify(j));
}

export const cmds = {
  help([mode] = []) {
    const skill = mode === '--skill';
    P(skill
      ? `${c.w}Deliberate skill grammar${c.x}`
      : `${c.w}deliberate${c.x} ${c.d}(local, files-first — the project is the folder you're in)${c.x}`);
    for (const [cmd, desc] of skill ? SKILL_COMMANDS : CLI_COMMANDS) {
      P(`  ${c.w}${cmd}${c.x}\n      ${c.d}${desc}${c.x}`);
    }
  },

  // Set up the CURRENT folder (a repo root) as a project vault: the context in
  // deliberate/context/, decision records under deliberate/. Name = folder. Idempotent.
  // `init prompt` prints the Initiator prompt (method + the context scaffolds to fill).
  async init([sub]) {
    const abs = process.cwd();
    const p = openProjectVault(store, abs);
    setLast(p.id);
    installSonoranceSkill({ projectDir: abs });
    // Keep machine state out of git (if the project uses a .gitignore): the platform `.sonorance/`
    // and any hidden dot-subfolder written under `deliberate/`. Never creates a .gitignore.
    const ignored = ensureGitignore(abs, vaultIgnoreEntries(abs));
    if (sub === 'prompt') {
      const { system, user } = await initPrompt(store, p);
      return P(`MODEL: (produce in THIS session — you are the Initiator; read project files + external sources and edit the context files)\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
    }
    P(`${c.g}✓${c.x} Deliberate initialized in ${abs}`);
    P(`  project: ${c.w}${p.name}${c.x} ${c.d}(${p.id})${c.x}`);
    P(`  ${c.d}context lives in deliberate/context/product.md${c.x}; cases land under ${c.d}deliberate/cases/<date>-<slug>/${c.x}`);
    P(`  ${c.d}the root README points agents to deliberate/context/${c.x}`);
    P(`  ${c.d}platform config (shared, cross-skill) is in the hidden ${c.x}${c.w}.sonorance/${c.x}${c.d} sibling${c.x}`);
    if (ignored.length) P(`  ${c.d}gitignored machine state: ${ignored.join(', ')}${c.x}`);
    P(`  next → add external sources: ${c.w}deliberate source add <location>${c.x}`);
    P(`         get the method: ${c.w}deliberate init prompt${c.x} ${c.d}(then fill product.md + competitors.md + ecosystem.md)${c.x}`);
    P(`         first landscape: ${c.w}deliberate brief prompt${c.x}`);
  },

  // Start the local app: the web UI (src/ui) served over http by the
  // daemon, reading/editing the vault's records. It's the app UI, not the
  // pipeline — runs are driven by the /deliberate skill in your coding agent.
  // Holds the process open (the listening socket keeps Node alive).
  async serve() {
    // Serve the folder you launch from: make it the current project so the UI shows
    // THIS vault's cases — registering it if it's a deliberate/ vault not yet known.
    // (Without this the daemon would fall back to the last-used project pointer.)
    const abs = process.cwd();
    let p = store.listProjects().find(x => resolve(x.dir) === resolve(abs));
    if (!p && existsSync(join(abs, 'deliberate'))) p = openProjectVault(store, abs);
    if (p) setLast(p.id);
    const { startAppServer } = await import('../engine/app-boot.mjs');
    const port = opt('--port') ? +opt('--port') : undefined;
    const { port: boundPort } = await startAppServer(Number.isFinite(port) ? { port } : {});
    const url = buildLaunchUrl(`http://localhost:${boundPort}`, opt('--file'));
    // Record where this server is listening so `address`/`resolve` (and tools) reach THIS
    // server rather than guessing the default port. Cleared best-effort on exit.
    if (p) {
      try {
        writeFileSync(serveInfoPath(p.dir), JSON.stringify({ port: boundPort, pid: process.pid, version: pkgVersion(), ts: Date.now() }));
        const cleanup = () => { try { const cur = JSON.parse(readFileSync(serveInfoPath(p.dir), 'utf8')); if (cur.pid === process.pid) rmSync(serveInfoPath(p.dir), { force: true }); } catch {} };
        process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(0); }); process.on('SIGTERM', () => { cleanup(); process.exit(0); });
      } catch { /* non-fatal */ }
    }
    P(`${c.g}✓${c.x} Deliberate app → ${c.w}${url}${c.x}`);
    P(`  ${c.d}${p ? `vault: ${p.dir}` : `no Deliberate project in ${abs} — run ${c.x}${c.w}deliberate init${c.x}${c.d} here first`}${c.x}`);
    if (A.includes('--open')) openBrowser(url);
    P(`  ${c.d}Ctrl-C to stop.${c.x}`);
  },

  // Install the /deliberate skill so GitHub Copilot CLI discovers it, with the
  // current engine path baked in via scripts/engine.json. Default = global
  // (~/.copilot/skills); project-scoped with --here /
  // --project <dir> / a positional <dir> (writes into <repo>/.github/skills).
  install([target]) {
    const engineFile = fileURLToPath(import.meta.url);            // …/src/cli/deliberate.mjs
    const repoRoot = resolve(dirname(engineFile), '..', '..');
    // The canonical skill source is harness-neutral (`skill/`), NOT `.github/` (which is
    // this repo's dev/git config). `install` copies it into the target harness's skills
    // dir — Copilot's `.github/skills/deliberate` (project) or `~/.copilot/skills/deliberate`
    // (global) today; the same copy targets `.claude/skills`, Cursor, … as those land.
    const src = join(repoRoot, 'skill');
    if (!existsSync(src)) return P(`skill source not found at ${src}`);
    const projectDir = opt('--project') || (A.includes('--here') ? process.cwd() : (target && !target.startsWith('--') ? target : null));
    const project = !!projectDir;
    const dest = project ? join(resolve(projectDir), '.github', 'skills', 'deliberate') : join(homedir(), '.copilot', 'skills', 'deliberate');
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
    const engineConfig = installEngineConfig(repoRoot, engineFile);
    writeFileSync(join(dest, 'scripts', 'engine.json'), JSON.stringify(engineConfig, null, 2) + '\n');
    // Global install: rewrite the launcher reference to the absolute installed path (cwd is an
    // arbitrary repo). Project install: keep it relative — Copilot runs from that repo's root.
    if (!project) {
      const skillMd = join(dest, 'SKILL.md');
      writeFileSync(skillMd, readFileSync(skillMd, 'utf8').replaceAll('.github/skills/deliberate/scripts/deliberate.mjs', join(dest, 'scripts', 'deliberate.mjs')));
    }
    P(`${c.g}✓${c.x} installed the /deliberate skill ${c.d}(${project ? 'project' : 'global'})${c.x}`);
    P(`  ${c.d}${dest}${c.x}`);
    P(engineConfig.engine
      ? `  engine: ${c.d}${engineFile}${c.x} ${c.d}(source checkout, via scripts/engine.json)${c.x}`
      : `  engine: ${c.d}${engineConfig.package}@${engineConfig.version}${c.x} ${c.d}(pinned package, via scripts/engine.json)${c.x}`);
    P(project
      ? `  open ${c.w}${resolve(projectDir)}${c.x} in Copilot CLI and run ${c.w}/deliberate init${c.x}`
      : `  open any repo in Copilot CLI and run ${c.w}/deliberate init${c.x}`);
  },

  // External context sources: URLs or paths outside this project — recorded (with an optional inline description)
  // in the hand-editable `.sonorance/sources.md`. An optional description after the location
  // labels what the source is (e.g. `... add <location> "Roadmap"`). The host reads each
  // source itself in-harness; nothing is cloned or fetched by the CLI.
  async source([sub, ...r]) {
    const p = requireProject();
    if (sub === 'add') {
      const pos = [];
      for (let i = 0; i < r.length; i++) {
        if (r[i] === '--section') { i++; continue; }
        if (!String(r[i]).startsWith('--')) pos.push(r[i]);
      }
      const location = pos[0]; if (!location) return P('usage: deliberate source add <location> ["<description>"] [--section <section>]');
      if (!isExternalSource(p.dir, location)) {
        throw new CliError('project sources must be outside the current project folder; in-project files are read automatically');
      }
      const description = pos.slice(1).join(' ') || null;
      const section = opt('--section') || 'other';
      store.addSource(p.id, location, description, section);
      return P(`source added · ${section}${description ? c.d + ` — ${description}` + c.x : ''} ${c.d}(re-read it in-harness and update deliberate/context/product.md)${c.x}`);
    }
    if (sub === 'remove') { store.rmSource(p.id, r[0]); return P('removed'); }
    const grouped = new Map();
    for (const source of externalSources(p.dir, store.listSources(p.id))) {
      const title = source.sectionTitle || 'Other';
      if (!grouped.has(title)) grouped.set(title, []);
      grouped.get(title).push(source);
    }
    return P([...grouped].map(([title, sources]) => `${c.w}${title}${c.x}\n${sources.map(s => `  ${s.location}${s.description ? `\n      ${c.d}${s.description}${c.x}` : ''}`).join('\n')}`).join('\n') || '(none)');
  },

  // The `case` parent: noun-first, aggregating the whole case lifecycle. `new`/bare-idea
  // creates; `list` lists; `analysis`/`score`/`one-pager`/`prototype` each expose a
  // prompt|save pair (the skill loops prompt → produce in-harness → save). An unknown
  // first token is treated as the idea, so `deliberate case "<idea>"` still works.
  async case(r) {
    const p = requireProject();
    const [sub, ...rest] = r;
    if (sub === 'new') return caseNew(p, rest);
    if (sub === 'list') return caseList(p);
    if (sub === 'analysis') return caseAnalysis(p, rest[0], rest.slice(1));
    if (sub === 'score') return caseScore(p, rest[0], rest.slice(1));
    if (sub === 'one-pager') return caseOnepager(p, rest[0], rest.slice(1));
    if (sub === 'prototype') return caseProto(p, rest[0], rest.slice(1));
    return caseNew(p, r);                              // friendly alias: `case "<idea>"`
  },
  // ---- briefs (project-scoped landscape reports) ------------------------------
  // `brief prompt` prints the Briefer prompt; `brief save` persists it; `brief list`
  // lists them. To read a brief, open it in the app or read its file directly.
  async brief([sub]) {
    const p = requireProject();
    if (sub === 'list') return briefList(p);
    if (sub === 'prompt') {
      const { system, user } = await briefPrompt(store, p);
      return P(`MODEL: (produce in THIS session — you are the Briefer; research the landscape yourself)\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
    }
    if (sub === 'save') {
      const art = opt('--file') ? readFileSync(opt('--file'), 'utf8') : await readStdin();
      if (!art.trim()) return P('usage: deliberate brief save --file <path>  (or pipe via stdin)');
      const { brief, window } = await persistBrief(store, p, art);
      emit('brief.completed', {});
      return P(`saved brief ${c.w}${brief.id}${c.x} ${c.d}· ${briefPeriodLabel(window.start, window.end)}${c.x} → deliberate/briefs/`);
    }
    return P(`usage: deliberate brief <prompt|save|list>`);
  },

  // ---- product readouts (project-scoped metric + customer evidence reports) ---
  // `readout prompt` prints the Reporter prompt; `readout save` persists a new,
  // date-keyed artifact; `readout list` lists them newest first.
  async readout([sub]) {
    const p = requireProject();
    const timeZone = opt('--timezone');
    if ((sub === 'prompt' || sub === 'save') && A.includes('--timezone') && !timeZone) {
      throw new CliError('--timezone requires an IANA timezone such as America/Chicago');
    }
    if (sub === 'chart') {
      const spec = opt('--spec'), output = opt('--output');
      if (!spec || !output) return P('usage: deliberate readout chart --spec <json> --output <svg>');
      await renderTrendChartFile(resolve(spec), resolve(output));
      return P(`saved chart → ${resolve(output)}`);
    }
    if (sub === 'list') return readoutList(p);
    if (sub === 'prompt') {
      const { system, user } = await readoutPrompt(store, p, {
        periodStart: opt('--period-start'),
        periodEnd: opt('--period-end'),
        timeZone,
      });
      return P(`MODEL: (produce in THIS session — you are the Reporter; inspect the configured evidence yourself)\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
    }
    if (sub === 'save') {
      const file = opt('--file'), bundle = opt('--bundle');
      if (file && bundle) throw new CliError('readout save accepts either --file or --bundle, not both');
      const reportFile = bundle ? join(resolve(bundle), 'readout.md') : file;
      const art = reportFile ? readFileSync(reportFile, 'utf8') : await readStdin();
      if (!art.trim()) return P('usage: deliberate readout save [--file <path> | --bundle <dir>]  (or pipe via stdin)');
      if (!bundle && /!\[[^\]]+\]\((?:\.\/)?charts\/[^)]+\.svg/i.test(art)) {
        throw new CliError('readout.md references local charts — save its bundle with --bundle <dir>');
      }
      const charts = bundle ? loadReadoutCharts(resolve(bundle), art) : [];
      const { readout, window } = await persistReadout(store, p, art, {
        charts,
        periodStart: opt('--period-start'),
        periodEnd: opt('--period-end'),
        timeZone,
      });
      emit('readout.completed', {});
      return P(`saved readout ${c.w}${readout.id}${c.x} ${c.d}· ${readoutPeriodLabel(window.start, window.end)}${c.x}${charts.length ? ` · ${charts.length} chart${charts.length === 1 ? '' : 's'}` : ''} → deliberate/readouts/`);
    }
    return P('usage: deliberate readout <prompt|chart|save|list> [--period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD> --timezone <IANA>]');
  },

  // ---- matchups (project-scoped single-competitor head-to-heads) --------------
  // `matchup prompt <competitor>` prints the Scout prompt for one rival; `matchup save
  // <competitor>` persists it (refresh-in-place, keyed by the rival's slug); `matchup list`
  // lists them. To read a matchup, open it in the app or read its file directly.
  async matchup(r) {
    const p = requireProject();
    const [sub, ...rest] = r;
    if (sub === 'list') return matchupList(p);
    // The competitor is the positional args before any --flag (so multi-word names work
    // unquoted, e.g. `matchup prompt Acme Corp`).
    const flagIdx = rest.findIndex(a => a.startsWith('--'));
    const competitor = (flagIdx === -1 ? rest : rest.slice(0, flagIdx)).join(' ').trim();
    if (sub === 'prompt') {
      if (!competitor) return P('usage: deliberate matchup prompt <competitor>');
      const { system, user } = await matchupPrompt(store, p, competitor);
      return P(`MODEL: (produce in THIS session — you are the Scout; research the rival yourself)\n===== SYSTEM =====\n${system}\n\n===== TASK =====\n${user}`);
    }
    if (sub === 'save') {
      if (!competitor) return P('usage: deliberate matchup save <competitor> [--file <path>]');
      const art = opt('--file') ? readFileSync(opt('--file'), 'utf8') : await readStdin();
      if (!art.trim()) return P('usage: deliberate matchup save <competitor> --file <path>  (or pipe via stdin)');
      const existed = !!store.matchupForCompetitor(p.id, competitor);
      const { matchup } = await persistMatchup(store, p, competitor, art);
      emit('matchup.completed', { refreshed: existed });
      return P(`saved matchup ${c.w}${matchup.id}${c.x} ${c.d}· ${matchup.competitor} · as of ${matchupAsOfLabel(matchup.as_of)}${c.x} → deliberate/matchups/${matchup.slug}/`);
    }
    return P(`usage: deliberate matchup <prompt|save|list> [competitor]`);
  },

  // ---- feedback (to the makers) ----------------------------------------------
  // Send explicit, user-authored feedback to the product's makers. You (the agent) STRUCTURE it —
  // nudge for problem-framing on ideas, repro completeness on bugs — but NEVER rewrite the user's
  // words: the verbatim `message` is the source of truth (JTBD distillation happens founder-side).
  // Two shapes:
  //   • a full JSON record:  deliberate feedback --file fb.json   (or pipe the JSON on stdin)
  //   • a quick one-liner:   deliberate feedback "<message>" [--category bug|idea|praise|question|other]
  //         [--rating <1-5|up|down>] [--context "<why/what problem>"] [--agent-context "<safe summary>"]
  //         [--contact "<how to reach you>"] [--needs-framing]
  // Only a bug's pasted `diagnostics` blob is scrubbed (paths/secrets); the message is stored as
  // typed. A content-free `feedback` telemetry event (category + rating only) is emitted for
  // cross-surface parity — never the text, never files, never prompts/completions.
  async feedback(r) {
    let input = null;
    const fileArg = opt('--file');
    if (fileArg) {
      try { input = JSON.parse(readFileSync(fileArg, 'utf8')); }
      catch { return P(`${c.r}could not read --file as JSON${c.x}`); }
    } else {
      const msg = firstArg(r);
      if (!msg) {
        const piped = (await readStdin()).trim();                 // a harness may pipe a structured record
        if (piped) { try { input = JSON.parse(piped); } catch { input = { message: piped }; } }
      }
      if (!input) {
        if (!msg) return P('usage: deliberate feedback "<message>" [--category bug|idea|praise|question|other] [--rating <1-5|up|down>]  (or --file <json>)');
        const rawRating = opt('--rating');
        const rating = rawRating == null ? undefined
          : /^\d+$/.test(rawRating) ? Math.max(1, Math.min(5, +rawRating))
          : (rawRating === 'up' || rawRating === 'down') ? rawRating : undefined;
        input = {
          message: msg,
          category: opt('--category') || undefined,
          rating,
          context: opt('--context') || undefined,
          agent_context: opt('--agent-context') || undefined,
          contact: opt('--contact') || undefined,
          needs_framing: A.includes('--needs-framing') || undefined,
        };
      }
    }
    const p = curProject();
    const res = await submitFeedback(input, { surface: 'cli', product: 'deliberate', version: pkgVersion(), vaultDir: p?.dir || null });
    P(`${c.g}✓${c.x} feedback sent ${c.d}(${res.id})${c.x}`);
    if (res.needs_framing) P(`  ${c.y}note:${c.x} ${c.d}help the user frame the PROBLEM (what they want + why) before sending — don't propose a solution, and don't rewrite their words${c.x}`);
    return res;
  },

  // ---- the comment bridge (in-record annotations) ----------------------------
  // The app (deliberate serve) lets a reader select any span of the rendered record and
  // leave a comment. `comment list` fetches the batch of open comments (JSON, for the
  // harness); the harness answers each in this conversation (reading/refining the record
  // as needed) and marks it resolved with `comment <id> resolve`. Deliberate's counterpart
  // as an anchored, GitHub-PR-review-style workflow.
  async comment(r) {
    if (r[0] === 'list') return commentList();
    const VAL = new Set(['--note']);
    const pos = [];
    for (let i = 0; i < r.length; i++) {
      const a = String(r[i]);
      if (VAL.has(a)) { i++; continue; }              // skip a value flag AND its value
      if (a.startsWith('--')) continue;               // boolean flag (e.g. --revised)
      pos.push(a);
    }
    const [commentId, action] = pos;
    if (!commentId || action !== 'resolve') return P('usage: deliberate comment list  |  deliberate comment <commentId> resolve [--note "<text>"] [--revised]');
    const body = { commentId, revised: A.includes('--revised') };
    const note = opt('--note') ?? pos.slice(2).join(' '); if (note) body.note = note;
    const { p, base, unavailable } = await commentTarget();
    body.project = p.id;
    await resolveComment(
      `${base}/api/resolve`,
      body,
      unavailable,
    );
    return P(`${c.g}✓${c.x} resolved comment ${commentId}`);
  },
};

async function main() {
  store = openVault();
  A = process.argv.slice(2);
  const verb = cmds[A[0]] ? A[0] : 'help';
  const f = cmds[verb];
  // `serve` is the surface=ui process — the app server configures its own telemetry singleton;
  // double-configuring here would fight it. Everything else is a `cli` command we instrument.
  if (verb === 'serve') { await f.call(cmds, A.slice(1)); store.close(); return; }
  const freshInstall = ensureInstallId().fresh;              // capture BEFORE configure (which mints the id)
  configureTelemetry({ surface: 'cli', product: 'deliberate', version: pkgVersion(), vaultDir: curProject()?.dir || null });
  if (freshInstall) emit('install.created', {});
  emit('session.start', {});
  const t0 = Date.now();
  let ok = true;
  try {
    await f.call(cmds, A.slice(1));
  } catch (err) {
    ok = false;
    try { emit('error', { command: verb, class: (err && err.constructor && err.constructor.name) || 'Error' }); } catch { /* never let telemetry break the CLI */ }
    if (err instanceof CliError || err instanceof CommentClientError) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  } finally {
    try { emit('command.run', { name: verb, ok, duration_ms: Date.now() - t0 }); } catch { /* ignore */ }
    await shutdownTelemetry();
    store.close();
  }
}

// Run only when invoked as the entry point; importing (tests) just exposes `cmds`.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main();
