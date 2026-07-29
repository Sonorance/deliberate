/**
 * init.mjs — the Initiator: sets up a project's context. Like the other host-run roles,
 * the engine here is LLM-free — it assembles the producer prompt (the Initiator's method +
 * the latest context contracts) and the host does the reasoning in-session (reads the
 * project files + attached project-external sources, then creates or refreshes
 * deliberate/context/{product.md,competitors.md,ecosystem.md}).
 *
 * There is no `init save`: init edits the context files in place (they're written as
 * scaffolds by `deliberate init`), the way a stage's output-template lands in analysis.md.
 */
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { contextScaffold } from './scaffold.mjs';
import { externalSources } from './sources.mjs';

export const INIT_STAGE = 'init';

const scaffoldOnly = (project, product, competitors, ecosystem) =>
  product === contextScaffold('product', { name: project.name }).trim()
  && competitors === contextScaffold('competitors').trim()
  && ecosystem === contextScaffold('ecosystem').trim();

export function initMode(store, project) {
  const product = (store.readContext(project.id) || '').trim();
  const competitors = (store.readCompetitors(project.id) || '').trim();
  const ecosystem = (store.readEcosystem(project.id) || '').trim();
  return scaffoldOnly(project, product, competitors, ecosystem) ? 'create' : 'refresh';
}

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
  const mode = scaffoldOnly(project, product, competitors, ecosystem) ? 'create' : 'refresh';
  const srcRows = externalSources(project.dir, store.listSources(project.id));
  const srcs = srcRows.length
    ? '\n' + srcRows.map(s => `  - ${s.location}${s.description ? ` — ${s.description}` : ''}`).join('\n')
    : ' none';
  const latestContracts = mode === 'refresh'
    ? `\n\n## Latest context contracts from this installed Deliberate version\nUse these as the required structure. Add newly introduced sections and semantics, but do not copy their italic guidance into the project files.\n\n----- latest product.md contract -----\n${contextScaffold('product', { name: project.name })}\n\n----- latest competitors.md contract -----\n${contextScaffold('competitors')}\n\n----- latest ecosystem.md contract -----\n${contextScaffold('ecosystem')}`
    : '';
  const direction = mode === 'refresh'
    ? `Refresh the existing project context for "${project.name}" using the latest installed Deliberate method and context contracts. Treat the current files as grounded, user-editable evidence: preserve still-valid facts and deliberate user edits, correct stale claims, incorporate current project files and attached sources, and add any newly required context fields. Rewrite all three files coherently; never reset them to scaffolds or silently discard supported information.`
    : `Set up the project context for "${project.name}". Replace the scaffold guidance with real, grounded content.`;
  const user = `${direction} Read files inside this project directly and use the attached project-external sources, then EDIT these three files in deliberate/context/ **directly**; never fabricate a section you can't ground. In-project files are automatic grounding, not source entries.\n\n### Init mode: ${mode}\n\n### Attached project-external sources:${srcs}${latestContracts}\n\n## Current project context\n\n----- deliberate/context/product.md -----\n${product}\n\n----- deliberate/context/competitors.md -----\n${competitors}\n\n----- deliberate/context/ecosystem.md -----\n${ecosystem}`;
  return { system, user, model: cfg.model, mode };
}
