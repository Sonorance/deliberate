/**
 * roles.mjs — per-stage configuration, driven by roles/config.yaml.
 *
 * Each pipeline stage maps to an instructions path, an output template, a list of
 * reusable-skill paths, and — for `score` only — a model. The YAML is re-read on every
 * lookup, so editing it takes effect on the next invocation with no restart.
 *
 * Model resolution: DELIBERATE_MODEL=stub short-circuits to the stub model (so offline
 * tests stay deterministic) → roles/config.yaml → the built-in host MODEL. The host-run
 * stages (frame/shape/prototype) omit a model and inherit the default; only `score` sets
 * an explicit (cross-vendor) model for the isolated Evaluator sub-agent the host spawns.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The primary default model (used for the stub short-circuit in tests, and as the
// fallback when a stage declares no explicit model in roles/config.yaml).
const MODEL = process.env.DELIBERATE_MODEL || process.env.MODEL || 'claude-opus-4.8';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'roles', 'config.yaml');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KNOWN_STAGES = new Set(['frame', 'score', 'shape', 'launch', 'prototype', 'one-pager', 'brief', 'readout', 'matchup', 'init']);
const EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
const CONTEXTS = new Set(['default', 'long_context']);

const unquote = (s) => {
  const value = s.trim();
  const first = value[0], last = value[value.length - 1];
  const startsQuoted = first === '"' || first === "'";
  const endsQuoted = last === '"' || last === "'";
  if (startsQuoted || endsQuoted) {
    if (!startsQuoted || first !== last || value.length < 2) throw new Error('unbalanced quoted value');
    return value.slice(1, -1).trim();
  }
  return value;
};
const parseList = (v) => v.replace(/^\[|\]$/g, '').split(',').map(unquote).filter(Boolean);

// Minimal indentation-based YAML reader (no runtime deps). Handles nested maps
// (agent → fields → templates) and inline flow lists (`[a, b]`). Strips inline
// `# comments` and blank lines; values never contain spaces or '#'.
function readConfig(configPath) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  let source;
  try {
    source = readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read roles/config.yaml: ${error.message}`);
  }
  for (const [index, raw] of source.split('\n').entries()) {
    try {
      if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
      const line = raw.replace(/\s+#.*$/, '').replace(/\s+$/, '');
      if (!line.trim()) continue;
      const indent = raw.match(/^ */)[0].length;
      const m = line.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!m) throw new Error('expected key: value');
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].node;
      const [, key, value] = m;
      if (Object.hasOwn(parent, key)) throw new Error(`duplicate key "${key}"`);
      if (value.startsWith('[') !== value.endsWith(']')) throw new Error(`unterminated list for "${key}"`);
      if (value === '') { const child = {}; parent[key] = child; stack.push({ indent, node: child }); }
      else parent[key] = value.startsWith('[') ? parseList(value) : unquote(value);
    } catch (error) {
      throw new Error(`Invalid roles/config.yaml at line ${index + 1}: ${error.message}`);
    }
  }
  return root;
}

function validateStage(stage, cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error(`Invalid roles/config.yaml: missing "${stage}" stage`);
  const allowed = new Set(['instructions', 'templates', 'skills', ...(stage === 'score' ? ['model', 'reasoning_effort', 'context'] : [])]);
  for (const key of Object.keys(cfg)) {
    if (!allowed.has(key)) throw new Error(`Invalid roles/config.yaml: unexpected "${stage}.${key}"`);
  }
  if (typeof cfg.instructions !== 'string' || !cfg.instructions) throw new Error(`Invalid roles/config.yaml: "${stage}.instructions" is required`);
  if (!cfg.templates || typeof cfg.templates !== 'object' || Array.isArray(cfg.templates) || !Object.keys(cfg.templates).length) {
    throw new Error(`Invalid roles/config.yaml: "${stage}.templates" must declare at least one output`);
  }
  const requiredTemplates = stage === 'init' ? ['product', 'competitors', 'ecosystem'] : ['default'];
  for (const name of Object.keys(cfg.templates)) {
    if (!requiredTemplates.includes(name)) throw new Error(`Invalid roles/config.yaml: unexpected "${stage}.templates.${name}"`);
  }
  for (const name of requiredTemplates) {
    if (typeof cfg.templates[name] !== 'string' || !cfg.templates[name]) {
      throw new Error(`Invalid roles/config.yaml: "${stage}.templates.${name}" is required`);
    }
  }
  if (stage === 'score' && (typeof cfg.model !== 'string' || !cfg.model)) {
    throw new Error('Invalid roles/config.yaml: "score.model" is required');
  }
  if (cfg.reasoning_effort !== undefined && !EFFORTS.has(cfg.reasoning_effort)) {
    throw new Error('Invalid roles/config.yaml: "score.reasoning_effort" is invalid');
  }
  if (cfg.context !== undefined && !CONTEXTS.has(cfg.context)) {
    throw new Error('Invalid roles/config.yaml: "score.context" is invalid');
  }
  if (!Array.isArray(cfg.skills)) throw new Error(`Invalid roles/config.yaml: "${stage}.skills" must be a list`);
  const paths = [
    [`${stage}.instructions`, cfg.instructions],
    ...Object.entries(cfg.templates).map(([name, path]) => [`${stage}.templates.${name}`, path]),
    ...cfg.skills.map((path, index) => [`${stage}.skills[${index}]`, path]),
  ];
  for (const [name, path] of paths) {
    if (typeof path !== 'string' || !path || !existsSync(join(ROOT, path))) {
      throw new Error(`Invalid roles/config.yaml: "${name}" must reference an existing file`);
    }
  }
  return cfg;
}

// Full resolved config for a pipeline stage: { model, instructions, templates, skills }.
export function agentConfig(stage, configPath = CONFIG) {
  if (!KNOWN_STAGES.has(stage)) throw new Error(`Unknown role stage: ${stage}`);
  const all = readConfig(configPath);
  for (const known of KNOWN_STAGES) validateStage(known, all[known]);
  const cfg = all[stage];
  const stub = (process.env.DELIBERATE_MODEL || '') === 'stub';
  // Templates are config-driven. Most stages declare a single `default` output template
  // (the section's shape); `init` declares three (`product` + `competitors` + `ecosystem`) and no `default`.
  return {
    model: stub ? MODEL : (cfg.model || MODEL),
    instructions: cfg.instructions,
    templates: { ...cfg.templates },
    skills: [...cfg.skills],
    // Optional Copilot CLI tuning knobs (null = don't pass the flag → CLI default).
    effort: cfg.reasoning_effort || null,
    context: cfg.context || null,
  };
}

export const modelFor = (agent) => agentConfig(agent).model;
export const skillsFor = (agent) => agentConfig(agent).skills;
