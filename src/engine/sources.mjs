import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function canonicalPath(location) {
  let current = resolve(location);
  const missing = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    missing.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...missing);
}

function localSourcePath(projectDir, location) {
  const value = String(location || '').trim();
  if (!value) return null;

  if (/^file:/i.test(value)) {
    try {
      return fileURLToPath(value);
    } catch {
      return null;
    }
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return undefined;
  if (/^[^/\\\s]+@[^:\s]+:.+/.test(value)) return undefined;
  if (/^(?:www\.)?(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}\/\S+/i.test(value)) return undefined;

  const expanded = value === '~' ? homedir() : value.startsWith('~/') ? resolve(homedir(), value.slice(2)) : value;
  return isAbsolute(expanded) ? expanded : resolve(projectDir, expanded);
}

export function isExternalSource(projectDir, location) {
  const sourcePath = localSourcePath(projectDir, location);
  if (sourcePath === undefined) return true;
  if (sourcePath === null) return false;

  const projectPath = canonicalPath(projectDir);
  const candidatePath = canonicalPath(sourcePath);
  const fromProject = relative(projectPath, candidatePath);
  return fromProject !== '' && (fromProject === '..' || fromProject.startsWith(`..${sep}`) || isAbsolute(fromProject));
}

export function externalSources(projectDir, sources) {
  return sources.filter((source) => isExternalSource(projectDir, source.location));
}
