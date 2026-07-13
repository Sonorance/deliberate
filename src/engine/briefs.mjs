/**
 * briefs.mjs — the Briefer: a project-scoped, time-windowed landscape brief (NOT a case
 * stage). The host runs it in-session (like the Analyst), producing one Markdown artifact
 * that captures the competitive + market changes since the last brief. The engine here is
 * LLM-free: it computes the reporting window, assembles the producer prompt, and persists
 * the produced artifact as `deliberate/briefs/<YYYY-MM-DD>/brief.md`.
 *
 * The window is *since the last brief*, capped at 3 months: `end = now`,
 * `start = max(lastBriefEnd, now − 3 months)` — so a first-ever brief (or a stale one)
 * gets a full 3-month window, and a fresh cadence picks up exactly where the last left off.
 */
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { projectContext, cleanArtifact } from './pipeline.mjs';
import { unwrapProse } from 'sonorance/plugins/deliberate/markdown.mjs';

export const BRIEF_STAGE = 'brief';
export const BRIEF_WINDOW_MONTHS = 3;

// Subtract N calendar months from a timestamp (the "not more than 3 months" floor).
function monthsBefore(ts, n) { const d = new Date(ts); d.setMonth(d.getMonth() - n); return d.getTime(); }

// The reporting window for the NEXT brief of this project. `end` = now; `start` = the
// previous brief's period_end, but never earlier than 3 months ago (so a first brief or a
// stale one is capped at a 3-month look-back).
export function briefWindow(store, pid, at = Date.now()) {
  const floor = monthsBefore(at, BRIEF_WINDOW_MONTHS);
  const last = store.lastBriefEnd(pid);
  const firstEver = last == null;
  const capped = !firstEver && last < floor;        // previous brief older than 3 months → floor wins
  const start = firstEver ? floor : Math.max(last, floor);
  return { start, end: at, floor, firstEver, capped, last };
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const briefPeriodLabel = (start, end) => `${fmtDate(start)} – ${fmtDate(end)}`;

// Strip an optional leading YAML frontmatter block from a stored brief file, leaving the
// markdown body (the report itself, without the type/id/period metadata).
const stripFrontmatter = (raw) => { const m = String(raw || '').match(/^---\n[\s\S]*?\n---\n?/); return m ? raw.slice(m[0].length) : String(raw || ''); };

// The most recent brief for a project, as a read-only "prior context" block: its period
// label + full body. This is the grounding for "report only what changed SINCE last time"
// and "never re-report a change a prior brief already covered". Empty for a first-ever brief.
export function previousBriefBlock(store, pid) {
  const prev = (store.listBriefs(pid) || [])[0];   // listBriefs is newest-first
  if (!prev) return '';
  const rec = store.readBriefRecord(prev.id);
  const body = stripFrontmatter(rec?.text).trim();
  if (!body) return '';
  return `## Previous brief — read-only prior context (${briefPeriodLabel(prev.period_start, prev.period_end)})\nThis is the brief immediately before the one you are writing. Do NOT re-report anything it already covered; report only what changed AFTER its window. It is the proof a prior brief exists — this is NOT the first brief for this project.\n\n${body}`;
}

// Describe the window (and why it's bounded the way it is) for the producer prompt. State
// FIRST-vs-not explicitly and, when a prior brief exists, anchor to its end date — otherwise
// a tight window (e.g. one that happens to align with project creation) tempts the host to
// narrate "this is the first brief", which is wrong when an earlier brief exists.
function windowNote(win) {
  if (win.firstEver) return 'This is the FIRST brief for this project — there is no previous brief. Report changes from the last 3 months (the cap).';
  const prev = fmtDate(win.last);
  if (win.capped) return `This is NOT the first brief for this project (the previous brief ended ${prev}, more than 3 months ago). Report changes from the last 3 months (the cap), not all the way back to it.`;
  return `This is NOT the first brief for this project. The previous brief covered through ${prev}; report only changes since then, and no older.`;
}

// The exact producer prompt for a brief: grounding + the landscape-scan skill + the Briefer
// instructions (system) and the reporting window + project competitors + output template
// (user). The in-harness skill hands this to the host agent, which does the research itself.
export async function briefPrompt(store, project, { at = Date.now() } = {}) {
  const cfg = agentConfig(BRIEF_STAGE);
  const instruction = await loadBody(cfg.instructions);
  const agents = await read('AGENTS.md');
  const template = await read(cfg.templates.default);
  const skillsBlock = (await loadSkills(cfg.skills)) || '(none)';
  const pctx = projectContext(store, project);
  const competitors = (store.readCompetitors(project.id) || '').trim();
  const compBlock = competitors ? `\n\n## Competitor monitoring sources (competitors.md)\n${competitors}` : '';
  const ecosystem = (store.readEcosystem(project.id) || '').trim();
  const ecoBlock = ecosystem ? `\n\n## Ecosystem monitoring sources (ecosystem.md)\n${ecosystem}` : '';
  const system = `${agents}\n\n${pctx}${compBlock}${ecoBlock}\n\n## Skills\n${skillsBlock}\n\n## Stage instructions\n${instruction}`;
  const win = briefWindow(store, project.id, at);
  const windowBlock = `## Reporting window (STRICT)\n${windowNote(win)}\n- period_start: ${fmtDate(win.start)}\n- period_end: ${fmtDate(win.end)}\nReport ONLY changes dated within this window. Set the brief's "Period:" line to exactly "${briefPeriodLabel(win.start, win.end)}" — just the dates, with no added parenthetical or commentary (never label it a "first brief" or tie it to project creation).`;
  const prevBlock = previousBriefBlock(store, project.id);
  const tpl = template
    ? `\n\n----- OUTPUT TEMPLATE -----\n(Fill EVERY section with real, grounded, source-linked content. The italic _..._ lines and parentheticals are guidance for you — replace them; never echo the template's guidance text, and do not add a "grounding"/"notes"/"methodology" section.)\n${template}`
    : '';
  const user = `${windowBlock}${prevBlock ? `\n\n${prevBlock}` : ''}\n\nProduce the brief.${tpl}`;
  return { system, user, template, window: win, model: cfg.model };
}

// Persist a produced brief artifact (LLM-free): clean it, compute the authoritative window,
// and write it to a new dated brief folder. Shared by the engine and `deliberate brief save`.
export async function persistBrief(store, project, rawArtifact, { at = Date.now() } = {}) {
  const cfg = agentConfig(BRIEF_STAGE);
  const template = await read(cfg.templates.default);
  const body = unwrapProse(cleanArtifact(rawArtifact, template));
  const win = briefWindow(store, project.id, at);
  const brief = store.createBrief(project.id, {
    period_start: win.start, period_end: win.end, model: cfg.model, body,
  }, at);
  return { brief, window: win };
}
