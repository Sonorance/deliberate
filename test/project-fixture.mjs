import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appHome, vaultConfigPath } from 'sonorance/plugins/deliberate/paths.mjs';
import { scaffoldContext } from '../src/engine/scaffold.mjs';

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';

export function createProjectWithId(store, id, name = id) {
  const dir = join(appHome(), 'test-vaults', id);
  mkdirSync(join(dir, '.sonorance'), { recursive: true });
  writeFileSync(vaultConfigPath(dir), JSON.stringify({ id, name, created_at: Date.now() }, null, 2) + '\n');
  return scaffoldContext(store.openVaultFolder(dir, { name, makeCurrent: !store.getCurrent() }));
}

export function createProject(store, name) {
  const base = slug(name);
  let id = base, n = 1;
  while (store.getProject(id)) id = `${base}-${++n}`;
  return createProjectWithId(store, id, name);
}
