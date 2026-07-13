// Test preload — the single guard that keeps the whole suite from emitting live telemetry to the
// shipped default Azure Monitor destination (which would be noise in production analytics).
//
// Loaded via `node --test --import ./test-setup.mjs` (see package.json → scripts.test). Node
// forwards `--import` to every per-file test process, and because it sets an env var, any CLI child
// process a test spawns with inherited env inherits it too — so nothing anywhere sends. The
// deliberate CLI configures telemetry (surface=cli) on every run through sonorance/telemetry.mjs.
//
// This sets the standard DO_NOT_TRACK opt-out, so telemetry resolves to `off` by default. It does
// NOT block a test from choosing `console` mode explicitly (SONORANCE_TELEMETRY=console still wins,
// per resolveMode) — that path writes only the local JSONL audit trail and never touches the
// network, which is exactly what telemetry-cli.test.mjs asserts against.
if (!process.env.DO_NOT_TRACK) process.env.DO_NOT_TRACK = '1';
