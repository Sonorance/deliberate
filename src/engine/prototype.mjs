/**
 * prototype.mjs — the Prototype: a self-contained, openable mock of a case's primary
 * journey, a recomputable companion to the decision record (analysis.md), NOT a funnel
 * stage.
 *
 * The Prototyper is the HOST (in-session): it reads the finished case record (frame +
 * shape + launch) and builds a self-contained artifact native to a PRIMARY surface. The
 * artifact is always an openable single-file `index.html`, but its MEDIUM follows the
 * surface — a clickable GUI page, a CLI terminal replay, an API request/response explorer,
 * an agent-session replay, and so on (see roles/prototyper/prototype/instructions.md). A
 * case can hold one prototype per primary surface: the single-surface default is the flat
 * `prototype/index.html`; each additional surface nests as `prototype/<slug>/index.html`.
 *
 * The prototype is deliberately decoupled from the funnel — its own artifact — so it's
 * built only on request (never auto-run) and can be rebuilt after the analysis is revised,
 * exactly like the score and the one-pager. `PROTOTYPE_STAGE` is the config key
 * (roles/config.yaml) the Prototyper role resolves under.
 *
 * Like the Score/One-pager, the engine here is LLM-free: it assembles the producer prompt
 * (grounding + skills + instructions + the accumulated case record) and deterministically
 * persists what the host produces as `deliberate/cases/<case>/prototype/[<surface>/]index.html`.
 * The decision record links to each built surface (a "## Prototype" section).
 */
import { PROTOTYPE_STAGE } from 'sonorance/plugins/deliberate/stages.mjs';
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { projectContext, caseContext, cleanArtifact } from './pipeline.mjs';

// The config key (roles/config.yaml) + role folder for the Prototyper sub-job. It IS the
// PROTOTYPE_STAGE, but never enters the funnel state machine (STAGES) — the prototype is a
// standalone, recomputable artifact (like SCORE_STAGE / ONEPAGER_STAGE).
export const PROTO_STAGE = PROTOTYPE_STAGE;

// A prototype targets ONE of the product's PRIMARY surfaces (init marks them). The surface is a
// short slug — `cli`, `api`, `web`, `mcp`, … — used both to label the prompt's medium and to key
// the artifact on disk (`prototype/<slug>/index.html`; the default single surface stays flat).
// Slugified so it is a safe path segment and can never escape the case's prototype folder.
export const surfaceSlug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Pull the deliverable HTML out of a producer's artifact: a ```html fenced block, else a
// bare <!DOCTYPE …>/<html>…</html> document.
export const extractHtml = (t) => { const f = t.match(/```html\s*\n([\s\S]*?)```/i); if (f) return f[1].trim(); const d = t.match(/<!DOCTYPE html[\s\S]*<\/html>/i) || t.match(/<html[\s\S]*<\/html>/i); return d ? d[0].trim() : null; };
// A minimal placeholder page when the producer returned no usable HTML — so the case
// still has an openable `prototype/index.html` that names the case and invites a rebuild.
export const fallbackProtoHtml = (kase) => `<!DOCTYPE html><html><head><meta charset=utf-8><title>${kase.title}</title></head><body style="font:16px system-ui;max-width:640px;margin:40px auto;padding:0 20px"><h1>${kase.title}</h1><p>Prototype mock not yet generated — re-run the prototype to regenerate.</p></body></html>`;

// The exact producer prompt for a case's Prototype: grounding + the prototyping skills +
// the Prototyper instructions (system) and the accumulated case record — the finished
// frame/shape/launch whose primary journey it must mock (user). When a `surface` is given the
// prompt pins the medium to that primary surface (a GUI clickable page, a CLI terminal replay,
// an API request/response explorer, an agent-session replay, …); otherwise the Prototyper picks
// the product's single primary surface. The in-harness skill hands this to the host, who builds
// the self-contained HTML artifact native to that surface.
export async function prototypePrompt(store, project, kase, surface = '') {
  const slug = surfaceSlug(surface);
  const cfg = agentConfig(PROTO_STAGE);
  const instruction = await loadBody(cfg.instructions);
  const agents = await read('AGENTS.md');
  const template = await read(cfg.templates.default);
  const skillsBlock = (await loadSkills(cfg.skills)) || '(none)';
  const pctx = projectContext(store, project);
  const system = `${agents}\n\n${pctx}\n\n## Skills\n${skillsBlock}\n\n## Stage instructions\n${instruction}`;
  const ctx = caseContext(store, kase);
  const tpl = template
    ? `\n\n----- OUTPUT TEMPLATE -----\n(Fill EVERY section with real, grounded content drawn ONLY from the record below. The italic _..._ lines and parentheticals are guidance for you — replace them; never echo the template's guidance text.)\n${template}`
    : '';
  const surfaceLine = slug
    ? `Target surface: **${slug}** — build the prototype in the medium native to THIS primary surface (see the Prototyper instructions), not a graphical app unless this surface IS a GUI.\n`
    : `Target the product's single primary surface — build the prototype in the medium native to it (see the Prototyper instructions).\n`;
  const user = `${surfaceLine}Finished case record (mock ONLY its primary journey — invent no new capabilities or demand):\n${ctx}\nProduce the prototype as a single self-contained HTML document.${tpl}`;
  return { system, user, template, model: cfg.model, surface: slug };
}

// Persist a produced Prototype (LLM-free): clean the artifact, pull out the deliverable
// HTML (or a minimal fallback page), and write it to `prototype/[<surface>/]index.html` beside
// the record (the store also refreshes the record's links). The HTML is byte-preserved — never
// reflowed. Shared by the engine and `deliberate case prototype save`.
export async function persistPrototype(store, project, kase, rawArtifact, surface = '') {
  const slug = surfaceSlug(surface);
  const cfg = agentConfig(PROTO_STAGE);
  const template = await read(cfg.templates.default);
  const art = cleanArtifact(rawArtifact, template);
  const html = extractHtml(art) || fallbackProtoHtml(kase);
  store.writePrototype(kase.id, html, slug);
  return { case: store.getCase(kase.id), file: store.prototypeRef(kase.id, slug), surface: slug };
}
