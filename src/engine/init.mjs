/**
 * init.mjs — the Initiator: sets up a project's context. Like the other host-run roles,
 * the engine here is LLM-free — it assembles the producer prompt (the Initiator's method +
 * the three context scaffolds to fill) and the host does the reasoning in-session (reads the
 * project files + attached project-external sources, then edits deliberate/context/{product.md,competitors.md,ecosystem.md}).
 *
 * There is no `init save`: init edits the context files in place (they're written as
 * scaffolds by `deliberate init`), the way a stage's output-template lands in analysis.md.
 */
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { externalSources } from './sources.mjs';

export const INIT_STAGE = 'init';

// The exact producer prompt for `init`: grounding + skills + the Initiator instructions
// (system) and the attached sources + the current context files to fill (user). The
// in-harness skill hands this to the host, which reads the repo/sources and edits the files.
export async function initPrompt(store, project) {
  const cfg = agentConfig(INIT_STAGE);
  const instruction = await loadBody(cfg.instructions);
  const agents = await read('AGENTS.md');
  const skillsBlock = (await loadSkills(cfg.skills)) || '(none)';
  const system = `${agents}\n\n## Skills\n${skillsBlock}\n\n## Stage instructions\n${instruction}`;
  const product = (store.readContext(project.id) || '').trim();
  const competitors = (store.readCompetitors(project.id) || '').trim();
  const ecosystem = (store.readEcosystem(project.id) || '').trim();
  const srcRows = externalSources(project.dir, store.listSources(project.id));
  const srcs = srcRows.length
    ? '\n' + srcRows.map(s => `  - ${s.location}${s.description ? ` — ${s.description}` : ''}`).join('\n')
    : ' none';
  const user = `Set up the project context for "${project.name}". Read files inside this project directly and use the attached project-external sources, then EDIT these three files in deliberate/context/ **directly** (they exist as scaffolds — replace the italic guidance with real, grounded content; never fabricate a section you can't ground). In-project files are automatic grounding, not source entries.\n\n### Attached project-external sources:${srcs}\n\n----- deliberate/context/product.md -----\n${product}\n\n----- deliberate/context/competitors.md -----\n${competitors}\n\n----- deliberate/context/ecosystem.md -----\n${ecosystem}`;
  return { system, user, model: cfg.model };
}
