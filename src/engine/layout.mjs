/**
 * layout.mjs — the SINGLE SOURCE OF TRUTH for Deliberate's on-disk grammar.
 *
 * Deliberate is files-first (no database); this describes where everything lives. Tests tie
 * these paths to the real resolvers in paths.mjs, so a path change that is not reflected here
 * fails the suite. Paths are relative to a project **vault** (the repo the harness runs in)
 * unless noted; `~/.sonorance/` is the global platform home (shared with Sonorance).
 */

// Each entry: [path, description]. `<case>` = `YYYY-MM-DD-slug` (no number; the case's
// stable hash id lives in the record's frontmatter, and the date sorts chronologically).
// Kept sorted alphabetically by path.
export const FS_LAYOUT = [
  ['.sonorance/', 'Hidden Sonorance platform state (sibling to deliberate/): shared, cross-skill project configuration. Committed to git.'],
  ['.sonorance/config.json', 'Per-vault identity (id, name, repo, created_at) and active case. Committed (don’t hand-edit).'],
  ['.sonorance/local/', 'Machine-local runtime state — gitignored. Disposable/regenerable; never shared across machines.'],
  ['.sonorance/local/comments.jsonl', 'Generic in-record comments (annotations on any file) — a platform feature, not Deliberate-specific.'],
  ['.sonorance/local/state.json', 'Disposable editor state — open tabs, active tab, Explorer collapse/expand. Regenerable; safe to delete.'],
  ['.sonorance/plugins.json', 'The vault’s enabled bundled plugin ids — Deliberate registers itself here so `sonorance serve` composes its capabilities additively. Committed.'],
  ['.sonorance/sources.md', 'The project’s categorized grounding sources — hand-editable Markdown grouped into product, code, data, customer, go-to-market, and other sections. Committed.'],
  ['deliberate/', 'Deliberate’s home in the repo — everything below lives here.'],
  ['deliberate/briefs/<YYYY-MM-DD>/brief.md', 'A landscape brief — competitive + market changes since the last brief (≤ 3 months).'],
  ['deliberate/cases/<case>/analysis.md', 'The whole case: frontmatter (lens, state, score, per-stage) + the decision record — title, a 1–2 sentence case summary, then one lens-shaped section per stage in funnel order.'],
  ['deliberate/cases/<case>/log.jsonl', 'The producer/evaluator run log for the case.'],
  ['deliberate/cases/<case>/one-pager.md', 'The lens-appropriate decision one-pager — product reverse PR-FAQ, market decision brief, strategy memo, or platform decision memo.'],
  ['deliberate/cases/<case>/prototype/<surface>/index.html', 'An additional testable prototype for an eligible product surface or market touchpoint beyond the default (`deliberate case prototype prompt --surface <slug>` then `save`).'],
  ['deliberate/cases/<case>/prototype/index.html', 'The default testable prototype for an eligible product or market case — a recomputable companion to analysis.md, built on request.'],
  ['deliberate/cases/<case>/score.md', 'The lens-aware Evaluator’s go/no-go verdict with actual model + independence provenance — a recomputable companion to analysis.md.'],
  ['deliberate/context/*.md', 'Additional context files, read as grounding.'],
  ['deliberate/context/competitors.md', 'Official monitoring sources for each competitor (host-written during init).'],
  ['deliberate/context/ecosystem.md', 'Official monitoring sources for each ecosystem player — dependencies, complements, channels, movers (host-written during init).'],
  ['deliberate/context/product.md', 'The core project context — overview, personas, jobs, competitors, ecosystem, etc. (markdown, human-curated).'],
  ['deliberate/matchups/<competitor-slug>/matchup.md', 'A competitive matchup — a grounded, point-in-time head-to-head against one named rival (one canonical doc per rival, refreshed in place).'],
  ['deliberate/readouts/<YYYY-MM-DD[-N]>/charts/<metric>.svg', 'Up to three deterministic trend charts for decision-relevant key metrics, generated from normalized completed-period time series and embedded by readout.md.'],
  ['deliberate/readouts/<YYYY-MM-DD[-N]>/readout.md', 'A product readout — configured key metrics, optional trend charts, customer evidence, material insights, and warranted actions grounded in one completed reporting period; same-day reruns receive a numeric suffix.'],
  ['~/.sonorance/', 'The shared platform home (with Sonorance; override SONORANCE_HOME): the explicit vault registry + current pointer, settings, sonorance.log, and disposable cache. Project content stays in explicitly opened folders.'],
];
