/**
 * projects.mjs — project resolution + the shared "current project" pointer.
 *
 * A project is a **vault** (a plain folder that is its own source of truth).
 * Deliberate only opens explicit folders; it never fabricates hidden projects or
 * resolves commands against a globally selected vault outside the current folder.
 */
import { scaffoldContext } from './scaffold.mjs';

// Register an explicit folder as a project vault. Used by `deliberate init`.
export function openProjectVault(store, dir, opts = {}) {
  return scaffoldContext(store.openVaultFolder(dir, opts));
}

export function setCurrentProject(store, id) {
  store.setCurrent(id);
}
