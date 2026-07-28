/**
 * commands.mjs — the SINGLE SOURCE OF TRUTH for Deliberate's command surface.
 *
 * Three surfaces are described here:
 *   - SKILL_COMMANDS — the harness-facing `/deliberate` grammar (what a user types).
 *   - SKILL_FOLLOW_UPS — the next-step contract after each harness-facing command.
 *   - CLI_COMMANDS   — the engine binary (`deliberate …`) the skill shells into.
 *
 * Everything else is derived from these:
 *   - `deliberate help` renders CLI_COMMANDS and `deliberate help --skill` renders
 *     SKILL_COMMANDS (so either help surface never drifts),
 *   - tests fail if the CLI dispatches a command not listed here or omits a registered command.
 *
 * To add, rename, or remove a command, edit this file and update the implementation and shipped
 * skill in the same change. The filesystem grammar lives in layout.mjs.
 */

// Each entry: [command, one-line description]. `<id>` = required full case id or unique prefix;
// `<idea>` = free text / URL / file path. Kept sorted alphabetically by command.
export const SKILL_COMMANDS = [
  ['/deliberate address', 'Work through the reader’s in-record comments in the open app — answer or edit, then resolve (optional).'],
  ['/deliberate brief [period]', 'Produce a landscape brief — the previous 90 days on first run, then changes since the last brief, or a natural-language period override.'],
  ['/deliberate brief list', 'List the project’s briefs (newest first).'],
  ['/deliberate case <idea>', 'Analyze any consequential idea or signal; the host selects the relevant product, market, strategy, or platform methods, then completes frame → shape → launch, score, and one-pager.'],
  ['/deliberate case <id> prototype', 'Build a testable prototype for a completed product or market case.'],
  ['/deliberate case <id> score', 'Score a completed case through its recorded lens with a preferably isolated cross-vendor Evaluator; writes provenance-aware score.md.'],
  ['/deliberate case list', 'List all cases with their lenses and scores.'],
  ['/deliberate feedback', 'Send feedback to the makers — a bug (with repro steps), an idea (framed as the problem you’re solving), or praise; your words are sent verbatim, diagnostics are scrubbed, and never your files.'],
  ['/deliberate help', 'Show the current user-facing Deliberate command grammar and a concise description of every command.'],
  ['/deliberate init', 'Set up the current repo as a Deliberate project (you read it + write the context).'],
  ['/deliberate matchup <competitor>', 'Produce a competitive matchup — a grounded, point-in-time head-to-head against one named rival.'],
  ['/deliberate matchup list', 'List the project’s matchups (one per rival; newest first).'],
  ['/deliberate readout [period]', 'Produce a product readout for one completed period — the previous calendar week by default, or a natural-language override such as “for June” or “for Q2”.'],
  ['/deliberate readout list', 'List the project’s product readouts (newest first).'],
  ['/deliberate source add <location> ["<description>"] [--section <section>] | remove <location>', 'Add or remove a categorized, durable source outside the current project folder. It may be an internal system or a public resource; the host reads it in-harness.'],
  ['/deliberate source list', 'List the project’s durable sources from outside the current project folder.'],
];

// Each skill command has exactly one follow-up contract, in the same order as SKILL_COMMANDS.
// Exported for generated documentation and coverage checks.
export const SKILL_FOLLOW_UPS = [
  ['/deliberate address', 'After resolving comments or edits, ask to review the resolved changes in Sonorance Diff mode; default to opening the revised artifact.'],
  ['/deliberate brief [period]', 'When case-worthy signals exist, ask how to follow up with **Open for review + run cases** (default), **Open for review only**, and **Other**. The default opens the saved brief in Sonorance and runs the selected case analyses in parallel. With no case-worthy signal, offer to open the brief for review without manufacturing a case.'],
  ['/deliberate brief list', 'Ask which listed brief to open in Sonorance when the user has not already named one; do not infer a case analysis from a list command.'],
  ['/deliberate case <idea>', 'For a completed product or market case, ask to build the eligible prototype by default. For a strategy or platform case, ask to open the completed decision record in Sonorance by default.'],
  ['/deliberate case <id> prototype', 'Ask to open the case record and its prototype in Sonorance for review; default to opening it.'],
  ['/deliberate case <id> score', 'Ask to open the rescored case record in Sonorance for review; default to opening it.'],
  ['/deliberate case list', 'Ask which case to inspect or continue only when that intent is not already clear; otherwise end after listing.'],
  ['/deliberate feedback', 'Confirm that the feedback was sent with its receipt id; no additional product workflow is implied.'],
  ['/deliberate help', 'End after rendering the live command grammar unless the user selects a command.'],
  ['/deliberate init', 'Ask to run the first landscape brief; **Run brief** is the default and **Not now** is the alternative.'],
  ['/deliberate matchup <competitor>', 'When case-worthy insights exist, ask how to follow up with **Open for review + run cases** (default), **Open for review only**, and **Other**. The default opens the saved matchup in Sonorance and runs the selected case analyses in parallel. With no case-worthy insight, offer to open the matchup for review without manufacturing a case.'],
  ['/deliberate matchup list', 'Ask which listed matchup to open in Sonorance when the user has not already named one; do not infer a case analysis from a list command.'],
  ['/deliberate readout [period]', 'When case-worthy actions exist, ask how to follow up with **Open for review + run cases** (default), **Open for review only**, and **Other**. The default opens the saved readout in Sonorance and runs the selected case analyses in parallel. With no case-worthy action, offer to open the readout for review without manufacturing a case.'],
  ['/deliberate readout list', 'Ask which listed readout to open in Sonorance when the user has not already named one; do not infer a case analysis from a list command.'],
  ['/deliberate source add <location> ["<description>"] [--section <section>] | remove <location>', 'Ask to refresh the affected project context from the changed source; default to refreshing it.'],
  ['/deliberate source list', 'End after listing unless the user asks to add, remove, or inspect a source.'],
];

// Each entry: [invocation, one-line description]. Commands are noun-first, aggregated under
// their parent (`case`, `brief`, `source`, `comment`). Kept sorted alphabetically by invocation.
export const CLI_COMMANDS = [
  ['brief list', 'List the project’s briefs (newest first; delete one by removing its folder).'],
  ['brief prompt [--period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD>]', 'Print the Briefer prompt for the default 90-day/since-last window or an explicit period.'],
  ['brief save [--file <path>] [--period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD>]', 'Persist a produced brief and its selected period into deliberate/briefs/<date>/brief.md; prints its id.'],
  ['case "<idea>" [--lens <lens>]', 'Create a case and print its id; --lens is selected by the host (product, market, strategy, or platform).'],
  ['case analysis prompt <id> [--note <text>]', 'Print the next lens-aware analysis stage’s prompt (frame → shape → launch) for the specified case.'],
  ['case analysis save <id> [--file <path>]', 'Persist a produced analysis stage into the specified case’s analysis.md and advance it.'],
  ['case list', 'List all cases with their lenses and scores. Rename by editing the file; delete by removing the folder.'],
  ['case new "<idea>" [--lens <lens>]', 'Create a case and print its id; --lens is selected by the host.'],
  ['case one-pager prompt <id>', 'Print the lens-appropriate one-pager prompt for a completed case.'],
  ['case one-pager save <id> [--file <path>]', 'Persist the produced one-pager for a completed case into one-pager.md beside analysis.md.'],
  ['case prototype list <id>', 'List the prototypes built for a case by grounded product surface or market touchpoint; the default is flat.'],
  ['case prototype prompt <id> [--surface <slug>]', 'Print the prototype prompt for a completed, eligible product or market case; --surface targets a product surface or market touchpoint.'],
  ['case prototype save <id> [--surface <slug>] [--file <path>]', 'Persist the produced prototype for a completed, eligible case into prototype/[<surface>/]index.html.'],
  ['case score prompt <id>', 'Print the decorrelated Evaluator prompt for a completed case; prefer an isolated cross-vendor sub-agent.'],
  ['case score save <id> --model <id> [--independent] [--file <path>]', 'Persist a completed case score with its actual evaluator model and independence status into score.md; --independent means an isolated evaluator produced it.'],
  ['comment <commentId> resolve [--note "<text>"] [--revised]', 'Resolve an in-record comment back to the app (comment bridge).'],
  ['comment list', 'Fetch the open in-record comments from the running app (comment bridge; JSON).'],
  ['feedback ["<message>"] [--category <cat>] [--rating <n>] [--file <json>]', 'Send user-authored feedback (bug/idea/praise) — verbatim words + scrubbed diagnostics — mirrored locally, then delivered to the configured telemetry backend (Azure Monitor by default, over OpenTelemetry-shaped signals).'],
  ['help [--skill]', 'Print the engine CLI grammar; --skill prints the current user-facing /deliberate grammar.'],
  ['init', 'Set up the current folder as a project (deliberate/ + context); name = folder.'],
  ['init prompt', 'Print the Initiator prompt (method + the context scaffolds) for the host to fill the project context.'],
  ['matchup list', 'List the project’s matchups (one per rival; newest first; delete one by removing its folder).'],
  ['matchup prompt <competitor>', 'Print the Scout prompt (context + the rival + template) for the host to fulfill.'],
  ['matchup save <competitor> [--file <path>]', 'Persist a produced matchup into deliberate/matchups/<slug>/matchup.md (refresh-in-place); prints its id.'],
  ['readout list', 'List the project’s product readouts (newest first; delete one by removing its folder).'],
  ['readout prompt [--period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD>] [--timezone <IANA>]', 'Print the Reporter prompt for one completed reporting period; defaults to the previous calendar week in the supplied timezone (UTC when omitted).'],
  ['readout chart --spec <json> --output <svg>', 'Render one validated key-metric time series as a deterministic, accessible SVG trend chart.'],
  ['readout save [--file <path> | --bundle <dir>] [--period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD>] [--timezone <IANA>]', 'Persist a product readout only when its Period line matches the selected completed period; for a bundle, also persist referenced charts/ SVG sidecars.'],
  ['serve [--open] [--port <n>] [--file <path>]', 'Start the local app on an available OS-assigned port unless --port is supplied (--open launches the browser, optionally at a project-relative Markdown file).'],
  ['source [list | add <location> ["<description>"] [--section <section>] | remove <location>]', 'List / manage categorized, durable context sources outside the current project folder, including internal systems and public resources (recorded in .sonorance/sources.md; the host reads each in-harness).'],
];

// The distinct top-level verbs the engine CLI must dispatch (first token of each command).
export const CLI_COMMAND_NAMES = [...new Set(CLI_COMMANDS.map(([c]) => c.split(' ')[0]))];
