/**
 * app-boot.mjs — boot the generic `sonorance` package (the local Markdown editor) for `deliberate
 * serve`. Sonorance is the host/platform; Deliberate is a per-vault PLUGIN bundled inside the
 * `sonorance` package. This entry just resolves the vault's composed engine (the base Sonorance
 * engine + any enabled plugin, e.g. Deliberate) and hands it to the server — the exact same path
 * the generic `sonorance serve` takes. No engine is injected FROM here; the plugin adds on top.
 *
 * This is the one place the `deliberate` → `sonorance` dependency is wired. `sonorance` is a
 * LOCAL dependency (package.json `"sonorance": "file:../sonorance-app"`); nothing is published.
 */
import { startServer } from 'sonorance';
import { resolveEngine } from 'sonorance/plugins';

export const startAppServer = async ({ root = process.cwd(), ...opts } = {}) => {
  const engine = await resolveEngine(root);
  return startServer({ ...opts, engine });
};
