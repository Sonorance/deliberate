/**
 * commands.mjs — the SINGLE SOURCE OF TRUTH for Deliberate's command surface.
 *
 * Two surfaces are described here:
 *   - SKILL_COMMANDS — the harness-facing `/deliberate` grammar (what a user types).
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

// Each entry: [command, one-line description]. `[id]` = optional case id (defaults to the
// latest case); `<idea>` = free text / URL / file path. Kept sorted alphabetically by command.
export const SKILL_COMMANDS = [
  ['/deliberate address', 'Work through the reader’s in-record comments in the open app — answer or edit, then resolve (optional).'],
  ['/deliberate brief', 'Produce a landscape brief — competitive + market changes since the last brief (≤ 3 months).'],
  ['/deliberate brief list', 'List the project’s briefs (newest first).'],
  ['/deliberate case <idea>', 'Analyze any consequential idea or signal; the host selects the relevant product, market, strategy, or platform methods, then completes frame → shape → launch, score, and one-pager.'],
  ['/deliberate case [id] prototype', 'Build a testable prototype for a completed product or market case (asks which eligible case if none is given).'],
  ['/deliberate case [id] score', 'Score a completed case through its recorded lens with a preferably isolated cross-vendor Evaluator; writes provenance-aware score.md.'],
  ['/deliberate case list', 'List all cases with their lenses and scores.'],
  ['/deliberate feedback', 'Send feedback to the makers — a bug (with repro steps), an idea (framed as the problem you’re solving), or praise; your words are sent verbatim, diagnostics are scrubbed, and never your files.'],
  ['/deliberate help', 'Show the current user-facing Deliberate command grammar and a concise description of every command.'],
  ['/deliberate init', 'Set up the current repo as a Deliberate project (you read it + write the context).'],
  ['/deliberate matchup <competitor>', 'Produce a competitive matchup — a grounded, point-in-time head-to-head against one named rival.'],
  ['/deliberate matchup list', 'List the project’s matchups (one per rival; newest first).'],
  ['/deliberate readout [period]', 'Produce a product readout for one completed period — the previous calendar week by default, or a natural-language override such as “for June” or “for Q2”.'],
  ['/deliberate readout list', 'List the project’s product readouts (newest first).'],
  ['/deliberate source add <location> ["<description>"] [--section <section>] | remove <location>', 'Add a categorized external context source from outside the current project folder (with an optional description), or remove one; the host reads it in-harness.'],
  ['/deliberate source list', 'List the project’s external context sources.'],
];

// Each entry: [invocation, one-line description]. Commands are noun-first, aggregated under
// their parent (`case`, `brief`, `source`, `comment`). Kept sorted alphabetically by invocation.
export const CLI_COMMANDS = [
  ['brief list', 'List the project’s briefs (newest first; delete one by removing its folder).'],
  ['brief prompt', 'Print the Briefer prompt (reporting window + context + template) for the host to fulfill.'],
  ['brief save [--file <path>]', 'Persist a produced brief into deliberate/briefs/<date>/brief.md; prints its id.'],
  ['case "<idea>" [--lens <lens>]', 'Create a case and make it active; --lens is selected by the host (product, market, strategy, or platform).'],
  ['case analysis prompt [id] [--note <text>]', 'Print the next lens-aware analysis stage’s prompt (frame → shape → launch) for the host to fulfill.'],
  ['case analysis save [id] [--file <path>]', 'Persist a produced analysis stage into analysis.md and advance the case.'],
  ['case list', 'List all cases with their lenses and scores (active marked *). Rename by editing the file; delete by removing the folder.'],
  ['case new "<idea>" [--lens <lens>]', 'Create a case and make it active; --lens is selected by the host.'],
  ['case one-pager prompt [id]', 'Print the lens-appropriate one-pager prompt for a completed case.'],
  ['case one-pager save [id] [--file <path>]', 'Persist the produced one-pager for a completed case into one-pager.md beside analysis.md.'],
  ['case prototype list [id]', 'List the prototypes built for a case by grounded product surface or market touchpoint; the default is flat.'],
  ['case prototype prompt [id] [--surface <slug>]', 'Print the prototype prompt for a completed, eligible product or market case; --surface targets a product surface or market touchpoint.'],
  ['case prototype save [id] [--surface <slug>] [--file <path>]', 'Persist the produced prototype for a completed, eligible case into prototype/[<surface>/]index.html.'],
  ['case score prompt [id]', 'Print the decorrelated Evaluator prompt for a completed case; prefer an isolated cross-vendor sub-agent.'],
  ['case score save [id] --model <id> [--independent] [--file <path>]', 'Persist a completed case score with its actual evaluator model and independence status into score.md; --independent means an isolated evaluator produced it.'],
  ['comment <commentId> resolve [--note "<text>"] [--revised]', 'Resolve an in-record comment back to the app (comment bridge).'],
  ['comment list', 'Fetch the open in-record comments from the running app (comment bridge; JSON).'],
  ['feedback ["<message>"] [--category <cat>] [--rating <n>] [--file <json>]', 'Send user-authored feedback (bug/idea/praise) — verbatim words + scrubbed diagnostics — mirrored locally, then delivered to the configured telemetry backend (Azure Monitor by default, over OpenTelemetry-shaped signals).'],
  ['help [--skill]', 'Print the engine CLI grammar; --skill prints the current user-facing /deliberate grammar.'],
  ['init', 'Set up the current folder as a project (deliberate/ + context); name = folder.'],
  ['init prompt', 'Print the Initiator prompt (method + the context scaffolds) for the host to fill the project context.'],
  ['install [--here | --project <dir>]', 'Install the /deliberate skill (global, or into a repo’s .github/skills).'],
  ['matchup list', 'List the project’s matchups (one per rival; newest first; delete one by removing its folder).'],
  ['matchup prompt <competitor>', 'Print the Scout prompt (context + the rival + template) for the host to fulfill.'],
  ['matchup save <competitor> [--file <path>]', 'Persist a produced matchup into deliberate/matchups/<slug>/matchup.md (refresh-in-place); prints its id.'],
  ['readout list', 'List the project’s product readouts (newest first; delete one by removing its folder).'],
  ['readout prompt [--period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD>] [--timezone <IANA>]', 'Print the Reporter prompt for one completed reporting period; defaults to the previous calendar week in the supplied timezone (UTC when omitted).'],
  ['readout chart --spec <json> --output <svg>', 'Render one validated key-metric time series as a deterministic, accessible SVG trend chart.'],
  ['readout save [--file <path> | --bundle <dir>] [--period-start <YYYY-MM-DD> --period-end <YYYY-MM-DD>] [--timezone <IANA>]', 'Persist a product readout only when its Period line matches the selected completed period; for a bundle, also persist referenced charts/ SVG sidecars.'],
  ['serve [--open] [--port <n>] [--file <path>]', 'Start the local app — the web UI over your vault (--open launches the browser, optionally at a project-relative Markdown file).'],
  ['source [list | add <location> ["<description>"] [--section <section>] | remove <location>]', 'List / manage categorized external context sources from outside the current project folder (recorded in .sonorance/sources.md; the host reads each in-harness).'],
];

// The distinct top-level verbs the engine CLI must dispatch (first token of each command).
export const CLI_COMMAND_NAMES = [...new Set(CLI_COMMANDS.map(([c]) => c.split(' ')[0]))];
