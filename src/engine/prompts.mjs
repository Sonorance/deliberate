/**
 * prompts.mjs — shared prompt-assembly helpers used by both the pipeline stages
 * (src/engine/pipeline.mjs) and the auxiliary contextualize agent
 * for the agents: read a repo-relative file, strip an optional YAML
 * frontmatter block, and render a skills block from a list of skill paths.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Read a repo-relative file; missing/unreadable files resolve to '' (callers degrade gracefully).
export const read = async (rel) => { try { return await readFile(join(ROOT, rel), 'utf8'); } catch { return ''; } };

// Strip an optional YAML frontmatter block; skills live in roles/config.yaml,
// so only the instruction body is needed downstream.
export async function loadBody(rel) {
  const raw = await read(rel);
  const fm = raw.match(/^---\n[\s\S]*?\n---\n?/);
  return fm ? raw.slice(fm[0].length) : raw;
}

// Skills are configured as repo-relative paths; the heading is the file's base name.
const skillName = (p) => p.replace(/^.*\//, '').replace(/\.md$/, '');
export const loadSkills = async (paths) => paths?.length
  ? (await Promise.all(paths.map(async p => `### ${skillName(p)}\n${await read(p)}`))).join('\n\n')
  : '';
