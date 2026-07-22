// Test preload — the single guard that keeps the whole suite from emitting live telemetry to the
// shipped default Azure Monitor destination (which would be noise in production analytics).
//
// Loaded via `node --test --import ./test-setup.mjs` (see package.json → scripts.test). Node
// forwards `--import` to every per-file test process, and because it sets an env var, any CLI child
// process a test spawns with inherited env inherits it too — so nothing anywhere sends. The
// deliberate CLI configures telemetry (surface=cli) on every run through sonorance/telemetry.mjs.
//
// SONORANCE_AUTOMATION is the hard test boundary: neither passive telemetry nor explicit feedback
// may use the network, even if a developer has SONORANCE_TELEMETRY=on in the ambient environment.
// Console mode still wins so telemetry-cli.test.mjs can inspect payloads without sending them.
process.env.SONORANCE_AUTOMATION = '1';
if (!process.env.DO_NOT_TRACK) process.env.DO_NOT_TRACK = '1';
