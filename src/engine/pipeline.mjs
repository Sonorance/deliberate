/**
 * pipeline.mjs — the stage building blocks the host/skill drives. The engine is
 * LLM-free: it assembles each stage's prompt (grounding + skills + instructions +
 * the accumulated record) via `stagePrompt`, and deterministically persists what the
 * host produces via `persistStage` (clean + heading-normalize + score + advance).
 * The host agent does all the reasoning; there is no engine-run funnel.
 */
import { STAGES, nextStage } from 'sonorance/plugins/deliberate/stages.mjs';
import { STATE, STATUS } from 'sonorance/plugins/deliberate/domain.mjs';
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { unwrapProse } from 'sonorance/plugins/deliberate/markdown.mjs';
import { caseLens, caseLensLabel } from './lenses.mjs';

export const scoreOf = (t) => { const m = t.match(/(?:total weighted score|score)[:*\s]+(10(?:\.0)?|[0-9](?:\.\d)?)/i); return m ? +m[1] : null; };

export function requireCompletedCase(store, kase, companion) {
  const completed = new Set(
    store.listStages(kase?.id)
      .filter((stage) => stage.status === STATUS.DONE)
      .map((stage) => stage.name),
  );
  if (kase?.state !== STATE.DONE || STAGES.some((stage) => !completed.has(stage))) {
    throw new Error(`${companion} requires a completed case (frame → shape → launch)`);
  }
}

function requireExpectedStage(kase, stage) {
  if (!STAGES.includes(stage)) throw new Error(`Unknown analysis stage: ${stage}`);
  const expected = kase?.state === STATE.NEW
    ? STAGES[0]
    : STAGES.includes(kase?.state) ? kase.state : null;
  if (stage !== expected) {
    throw new Error(expected
      ? `Cannot persist ${stage}; the next analysis stage is ${expected}`
      : `Cannot persist ${stage}; the case analysis is already complete`);
  }
}

// Deterministically scrub an artifact before it's saved as an end-user deliverable:
//  1. drop any line the agent copied verbatim from the output template's italic
//     "_…_" guidance (matched by emphasis/whitespace-normalized text, so a
//     reformatted copy is still caught) — the "never echo the template" rule, enforced;
//  2. drop internal/meta commentary about the run, session, or the agent's own
//     execution (e.g. "already produced in my previous response", "the task was to…").
// Never touches lines inside fenced code blocks (e.g. the prototype's HTML). Prose is
// unwrapped separately, per stage — NOT here — so the prototype's bare HTML/JS (which is
// newline-sensitive) is never reflowed.
const NORM = (s) => s.replace(/[*_`>]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const IS_ITALIC_LINE = (t) => /^(?:>\s*|[-*]\s+|\d+[.)]\s+)?_[^_].*_$/.test(t);
const META_RE = /\b(?:my |the )?previous (?:response|answer|session|run|turn)\b|\balready (?:produced|generated|created|completed|provided)\b|\bthe task was to\b|\bas (?:an? )?ai(?: (?:assistant|language model))?(?=[,.;]|$)|\bas (?:an? )?(?:assistant|language model)(?=[,.;]|$)|\bi (?:have )?(?:already )?(?:produced|generated|created|completed|provided|wrote|written)\b|\bin (?:my|this) (?:previous |earlier )?(?:response|answer|session|run|turn)\b|\bthis (?:completes|completed) the task\b|\b(?:no|any) (?:further|additional) (?:action|output) (?:is )?(?:needed|required)\b/i;
export function cleanArtifact(art, template) {
  const guide = new Set();
  for (const l of (template || '').split('\n')) { const t = l.trim(); if (IS_ITALIC_LINE(t)) { const n = NORM(t); if (n) guide.add(n); } }
  const out = []; let fence = false;
  for (const line of (art || '').split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; out.push(line); continue; }
    if (!fence) {
      const t = line.trim();
      if (t && guide.has(NORM(t))) continue;            // echoed template guidance
      if (t && META_RE.test(t)) continue;               // internal/run/execution meta
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Assemble the case's accumulated context: the case (its 1–2 sentence summary once
// written, else the raw prompt while it's still transient) + every prior stage's FULL
// artifact (not a lossy summary), passed to each role so it builds on — and never
// contradicts or loses — the work before it. With only a few coherent stages feeding
// one document, full context beats summary-chaining ("context is king").
export function caseContext(store, kase) {
  const lens = caseLens(kase);
  const prior = store.listStages(kase.id)
    .filter(s => s.status === STATUS.DONE)
    .map(s => `## ${s.name}\n${store.readStage(kase.project_id, kase.id, s.name, 'output_full.md') || ''}`)
    .join('\n\n');
  return `# ${kase.title}\n\n## Decision lens\n${caseLensLabel(lens)} (\`${lens}\`)\n\n## case\n${kase.summary || kase.description || ''}\n\n${prior}`;
}

// Per-project context block: the host-written markdown context (product.md) +
// attached sources + optional read-only repo, prepended to every stage's system
// prompt so Copilot is grounded in THIS project, not just the repo-level skills.
export function projectContext(store, project) {
  const ctx = (store.readContext(project.id) || '').trim();
  const srcRows = store.listSources(project.id);
  // Each source is passed WITH its (user-editable) description so the stage agents
  // know what each attached source is and why it's relevant — not just a bare URL.
  const srcs = srcRows.length
    ? '\n' + srcRows.map(s => `  - [${s.sectionTitle || 'Other'}] ${s.location}${s.description ? ` — ${s.description}` : ''}`).join('\n')
    : ' none';
  const body = ctx || `_Project context not written yet (run \`/deliberate init\`). Product: ${project.name}._`;
  return `## Project context (read-only)\n\n${body}\n\n### Attached sources:${srcs}` +
    (project.repo ? `\n### Connected repo (read-only): ${project.repo}` : '');
}

// ---- Reusable stage building blocks (the host/skill drives these; the engine only
//      builds the prompt and deterministically persists what the host produces) ----

// The exact producer prompt for a stage: grounding + skills + instructions (system)
// and the accumulated per-case context + output template (user). The in-harness
// skill hands this to the host agent / a Task sub-agent; the engine feeds it to
// `infer`. Returns `tpl` too (the template block reused for the revise turn).
export async function stagePrompt(store, project, kase, stage, note = null) {
  const lens = caseLens(kase);
  const cfg = agentConfig(stage, undefined, lens);
  const instruction = await loadBody(cfg.instructions);
  const agents = await read('AGENTS.md');
  const template = await read(cfg.templates.default);
  const skillsBlock = (await loadSkills(cfg.skills)) || '(none)';
  const pctx = projectContext(store, project);
  const system = `${agents}\n\n${pctx}\n\n## Skills\n${skillsBlock}\n\n## Stage instructions\n${instruction}`;
  const ctx = caseContext(store, kase);
  const tpl = template ? `\n\n----- OUTPUT TEMPLATE -----\n(Fill EVERY section with real, grounded content. The italic _..._ lines and parentheticals are guidance for you — replace them with your actual analysis. NEVER echo the template's guidance, placeholder, or instruction text in your output, and do not add a "grounding", "assumptions", or "notes" section.)\n${template}` : '';
  const user = `Context so far:\n${ctx}\nProduce ${stage} for this ${caseLensLabel(lens)} case.${tpl}${note ? `\nIterate note: ${note}` : ''}`;
  return { system, user, template, tpl, model: cfg.model, lens };
}

const STAGE_LABEL = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Embed a stage artifact under its `## <Stage>` section in the combined record: drop
// the artifact's own leading `# <Stage>` title (it duplicates the section header) and
// demote every heading one level (## → ###, etc.) so the record keeps ONE clean
// hierarchy. Headings inside fenced code blocks are left untouched.
function embedArtifact(md, stage) {
  const label = STAGE_LABEL(stage);
  const out = []; let fence = false, seenHeading = false;
  for (const line of (md || '').split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; out.push(line); continue; }
    const h = !fence && line.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (h) {
      if (!seenHeading && h[1] === '#' && h[2].trim().toLowerCase() === label.toLowerCase()) { seenHeading = true; continue; }
      seenHeading = true;
      out.push('#'.repeat(Math.min(6, h[1].length + 1)) + ' ' + h[2]);
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Persist a completed stage artifact (LLM-free): clean it, normalize its headings for
// the combined record, write the body section, record the score, and advance the case.
// Shared by the engine run and `deliberate case analysis save`. (Only the three funnel
// stages flow through here; the score/one-pager/prototype companions persist separately.)
export async function persistStage(store, project, caseId, stage, rawArtifact) {
  const kase = store.getCase(caseId);
  requireExpectedStage(kase, stage);
  const cfg = agentConfig(stage, undefined, caseLens(kase));
  const template = await read(cfg.templates.default);
  const art = cleanArtifact(rawArtifact, template);
  const sc = scoreOf(art);
  // Embed each stage's heading-normalized artifact, with hard-wrapped prose unwrapped so
  // the saved Markdown isn't artificially chopped into lines.
  const files = { 'output_full.md': unwrapProse(embedArtifact(art, stage)) };
  store.writeStage(project.id, caseId, stage, files);
  store.setStage(caseId, stage, { status: STATUS.DONE, score: sc, ended_at: Date.now(), model: cfg.model });
  const next = nextStage(stage);
  store.setCase(caseId, { state: next || STATE.DONE });
  return { case: store.getCase(caseId), stage, score: sc, next };
}
