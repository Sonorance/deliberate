/**
 * matchups.mjs — the Scout: a project-scoped, single-competitor head-to-head (NOT a case
 * stage, NOT a brief). The host runs it in-session (like the Briefer), producing one Markdown
 * artifact that reads ONE named rival against us across every dimension — a grounded,
 * point-in-time competitive matchup. The engine here is LLM-free: it assembles the producer
 * prompt (grounding + the rival + the prior matchup for an in-place refresh) and persists the
 * produced artifact as `deliberate/matchups/<competitor-slug>/matchup.md`.
 *
 * Unlike a brief (breadth of change over time, date-keyed, append-only), a matchup is
 * COMPETITOR-KEYED and REFRESHED IN PLACE: one canonical doc per rival, re-run to update
 * (git carries the history; `brief` owns the change-over-time series and signals when a
 * refresh is due). It is always true `as_of` a stated date, stamped in the body AND the
 * frontmatter.
 */
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { projectContext, cleanArtifact } from './pipeline.mjs';
import { unwrapProse } from 'sonorance/plugins/deliberate/markdown.mjs';

export const MATCHUP_STAGE = 'matchup';

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
// The human-readable "as of" label for a matchup (the date the read was true).
export const matchupAsOfLabel = (ts) => fmtDate(ts);

// Strip an optional leading YAML frontmatter block from a stored matchup file, leaving the
// markdown body (the head-to-head itself, without the type/id/competitor metadata). Also used
// to scrub any stray frontmatter a producer emits, so the saved file never carries a second
// metadata block on top of the store-written one.
const stripFrontmatter = (raw) => { const s = String(raw || '').replace(/^[\s\uFEFF]+/, ''); const m = s.match(/^---\n[\s\S]*?\n---\n?/); return m ? s.slice(m[0].length) : s; };

// The existing matchup for this rival, as a read-only "prior read" block: its `as_of` label +
// full body. This is the grounding for a REFRESH-IN-PLACE — keep what's still true, restamp
// the date, update only what moved. Empty when there is no prior matchup for the rival.
export function previousMatchupBlock(store, pid, competitor) {
  const prev = store.matchupForCompetitor(pid, competitor);
  if (!prev) return '';
  const rec = store.readMatchupRecord(prev.id);
  const body = stripFrontmatter(rec?.text).trim();
  if (!body) return '';
  return `## Existing matchup — read-only prior read (as of ${matchupAsOfLabel(prev.as_of || prev.updated_at)})\nThis is the CURRENT canonical matchup for this rival. You are REFRESHING it in place: keep everything still true, correct or update what has changed, restamp the "As of" date, and do NOT start from scratch or spawn a new copy.\n\n${body}`;
}

// The exact producer prompt for a matchup: grounding + the head-to-head skill (and jtbd /
// positioning / prioritization / tech-constraints / landscape-scan) + the Scout instructions
// (system) and the named rival + the as-of date + the prior matchup (for an in-place refresh)
// + the output template (user). The in-harness skill hands this to the host, which does the
// competitive research itself.
export async function matchupPrompt(store, project, competitor, { at = Date.now() } = {}) {
  const rival = String(competitor || '').trim();
  if (!rival) throw new Error('matchup requires a competitor (a name, product, or URL)');
  const cfg = agentConfig(MATCHUP_STAGE);
  const instruction = await loadBody(cfg.instructions);
  const agents = await read('AGENTS.md');
  const template = await read(cfg.templates.default);
  const skillsBlock = (await loadSkills(cfg.skills)) || '(none)';
  const pctx = projectContext(store, project);
  const competitors = (store.readCompetitors(project.id) || '').trim();
  const compBlock = competitors ? `\n\n## Competitor monitoring sources (competitors.md)\n${competitors}` : '';
  const system = `${agents}\n\n${pctx}${compBlock}\n\n## Skills\n${skillsBlock}\n\n## Stage instructions\n${instruction}`;
  const asOf = fmtDate(at);
  const tracked = competitors && new RegExp(`(^|\\n)#+\\s*${rival.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(competitors);
  const rivalBlock = `## The rival (STRICT)\nProduce a single-competitor head-to-head of **${rival}** against this project.\n- competitor: ${rival}\n- as_of: ${asOf}\n${tracked ? '- This rival is already tracked in competitors.md — use its monitoring sources as first-party grounding.' : '- This rival is NOT yet tracked in competitors.md — research it first-party from scratch, then ask the user whether to add it to the project context (default yes): on yes, add it to the Competitors roster in product.md AND its official monitoring sources to competitors.md so `brief` starts tracking it; on no, proceed without touching context.'}\nSet the matchup's "As of" line to exactly "${asOf}" — just the date, no added parenthetical. Every factual claim links to a first-party source, dated on or before ${asOf}; steelman the rival before finding its openings.`;
  const prevBlock = previousMatchupBlock(store, project.id, rival);
  const tpl = template
    ? `\n\n----- OUTPUT TEMPLATE -----\n(Fill EVERY section with real, grounded, source-linked content. The italic _..._ lines and parentheticals are guidance for you — replace them; never echo the template's guidance text, and do not add a "grounding"/"notes"/"methodology" section.)\n${template}`
    : '';
  const user = `${rivalBlock}${prevBlock ? `\n\n${prevBlock}` : ''}\n\nProduce the matchup.${tpl}`;
  return { system, user, template, competitor: rival, as_of: at, model: cfg.model };
}

// Persist a produced matchup artifact (LLM-free): clean it, stamp the authoritative as-of
// date, and upsert it by competitor slug (refresh-in-place). Shared by the engine and
// `deliberate matchup save`.
export async function persistMatchup(store, project, competitor, rawArtifact, { at = Date.now() } = {}) {
  const rival = String(competitor || '').trim();
  if (!rival) throw new Error('matchup requires a competitor (a name, product, or URL)');
  const cfg = agentConfig(MATCHUP_STAGE);
  const template = await read(cfg.templates.default);
  // Scrub any frontmatter the producer emits so the store's own frontmatter is the only one
  // (the output template carries none, but a stray block must never double up on the record).
  const body = unwrapProse(stripFrontmatter(cleanArtifact(rawArtifact, template)));
  const matchup = store.createMatchup(project.id, {
    competitor: rival, as_of: at, model: cfg.model, body,
  }, at);
  return { matchup };
}
