/**
 * score.mjs — the Score: the decorrelated Evaluator's go/no-go verdict for a case, a
 * recomputable companion to the decision record (analysis.md), NOT a funnel stage.
 *
 * The Evaluator is the ONE isolated, cross-vendor sub-agent (model-decorrelated from the
 * in-session Analyst): it reads the current case record and returns a scored verdict. The
 * score is deliberately decoupled from the funnel — its own `score.md` artifact — so a
 * revised analysis can be re-scored on demand (`deliberate case score`) without rewriting
 * the record. `EVALUATOR_STAGE` is the config key (roles/config.yaml) it resolves under.
 *
 * Like the Briefer/One-pager, the engine here is LLM-free: it assembles the producer
 * prompt (grounding + skills + instructions + the accumulated case record) and
 * deterministically persists what the host produces as
 * `deliberate/cases/<case>/score.md`, beside analysis.md, stamping the go/no-go number
 * onto the record. The decision record links to it (a "## Score" section) once it exists.
 */
import { EVALUATOR_STAGE } from 'sonorance/plugins/deliberate/stages.mjs';
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { projectContext, caseContext, cleanArtifact, scoreOf } from './pipeline.mjs';
import { unwrapProse } from 'sonorance/plugins/deliberate/markdown.mjs';

// The config key (roles/config.yaml) + role folder for the Evaluator's score sub-job.
// It IS the EVALUATOR_STAGE, but never enters the funnel state machine (STAGES) — the
// score is a standalone, recomputable artifact (like ONEPAGER_STAGE / BRIEF_STAGE).
export const SCORE_STAGE = EVALUATOR_STAGE;

// The exact producer prompt for a case's Score: grounding + the evaluator skills + the
// scoring instructions (system) and the accumulated case record it must judge (user).
// The in-harness skill hands this to an ISOLATED, cross-vendor sub-agent — decorrelated
// from the Analyst — which returns the scored verdict.
export async function scorePrompt(store, project, kase) {
  const cfg = agentConfig(SCORE_STAGE);
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
  const user = `Case record to evaluate (score ONLY this — introduce no new claims or evidence):\n${ctx}\nProduce the score.${tpl}`;
  return { system, user, template, model: cfg.model };
}

// Persist a produced Score (LLM-free): clean it, unwrap hard-wrapped prose, extract the
// go/no-go number, and write it to `score.md` beside the record (the store also stamps the
// number and evaluator provenance onto the record + refreshes its link). Shared by the
// engine and `case score save`.
export async function persistScore(store, project, kase, rawArtifact, provenance) {
  const model = String(provenance?.model || '').trim();
  if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)) {
    throw new Error('Score provenance requires a valid evaluator model id');
  }
  if (typeof provenance?.independent !== 'boolean') {
    throw new Error('Score provenance requires an independence status');
  }
  const cfg = agentConfig(SCORE_STAGE);
  const template = await read(cfg.templates.default);
  const body = unwrapProse(cleanArtifact(rawArtifact, template));
  const number = scoreOf(body);
  store.writeScore(kase.id, body, number, { model, independent: provenance.independent });
  return { case: store.getCase(kase.id), score: number, file: store.scoreRef(kase.id) };
}
