/**
 * onepager.mjs — the One-pager: a per-case, INTERNAL reverse-PR-FAQ (customer-voice) companion to the
 * decision record (analysis.md). It is NOT a funnel stage (no score, no gate) — it's an
 * Analyst *synthesis* sub-job the host runs right after the analysis, distilling the
 * finished record (frame + shape + launch) into a concise, customer-voiced narrative +
 * a short FAQ (Amazon Working-Backwards PR/FAQ lineage, minus the jargon).
 *
 * Like the Briefer, the engine here is LLM-free: it assembles the producer prompt
 * (grounding + skills + instructions + the accumulated case record) and deterministically
 * persists what the host produces as `deliberate/cases/<case>/one-pager.md`, beside
 * analysis.md. The decision record links to it (a "## One-pager" section) once it exists.
 */
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { projectContext, caseContext, cleanArtifact } from './pipeline.mjs';
import { unwrapProse } from 'sonorance/plugins/deliberate/markdown.mjs';

// The config key (roles/config.yaml) + role folder for the One-pager sub-job. Not a
// STAGES member, so it never enters the funnel state machine (like BRIEF_STAGE).
export const ONEPAGER_STAGE = 'one-pager';

// The exact producer prompt for a case's One-pager: grounding + the customer-lens skills
// (positioning + jtbd) + the One-pager instructions (system) and the accumulated case
// record — the finished frame/shape/launch it must distil — plus the output template
// (user). The in-harness skill hands this to the host (the Analyst), who writes it.
export async function onepagerPrompt(store, project, kase) {
  const cfg = agentConfig(ONEPAGER_STAGE);
  const instruction = await loadBody(cfg.instructions);
  const agents = await read('AGENTS.md');
  const template = await read(cfg.templates.default);
  const skillsBlock = (await loadSkills(cfg.skills)) || '(none)';
  const pctx = projectContext(store, project);
  const system = `${agents}\n\n${pctx}\n\n## Skills\n${skillsBlock}\n\n## Stage instructions\n${instruction}`;
  const ctx = caseContext(store, kase);
  const tpl = template
    ? `\n\n----- OUTPUT TEMPLATE -----\n(Fill EVERY section with real, grounded content drawn ONLY from the record below. The italic _..._ lines and parentheticals are guidance for you — replace them; never echo the template's guidance text, and do not add a "grounding"/"notes"/"assumptions" section.)\n${template}`
    : '';
  const user = `Finished case record (distil ONLY this — invent no new capabilities, demand, or evidence):\n${ctx}\nProduce the one-pager.${tpl}`;
  return { system, user, template, model: cfg.model };
}

// Persist a produced One-pager (LLM-free): clean it, unwrap hard-wrapped prose, and write
// it to `one-pager.md` beside the record (the store also refreshes the record's link).
// Shared by the engine and `deliberate case one-pager save`.
export async function persistOnepager(store, project, kase, rawArtifact) {
  const cfg = agentConfig(ONEPAGER_STAGE);
  const template = await read(cfg.templates.default);
  const body = unwrapProse(cleanArtifact(rawArtifact, template));
  store.writeOnepager(kase.id, body);
  return { case: store.getCase(kase.id), file: store.onepagerRef(kase.id) };
}
