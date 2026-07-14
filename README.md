# Deliberate

Deliberate is a files-first product toolkit inside your coding agent. It turns any consequential idea or signal—from a feature to a change in strategy, marketing, or the platform and ecosystem—into grounded, reviewable product work in the current repository. The CLI builds prompts, validates role configuration, and persists artifacts; the host coding agent performs the reasoning.

## Install and run

Node.js 22.5 or newer is required.

```bash
npx deliberate-cli install
```

Use `/deliberate` in a compatible coding-agent harness. A typical first journey establishes the product and market baseline before creating a case:

```text
/deliberate init
/deliberate brief

# Analyze a grounded idea or signal from the brief.
/deliberate case "Opportunity surfaced by the landscape brief"

# Review the decision; product and market cases may then get a testable prototype.
/deliberate readout
```

Run `deliberate serve --open` to review the generated Markdown, inspect diffs, and leave anchored comments in Sonorance. Add `--file "<project-relative-path>"` to open a specific case, brief, readout, or matchup immediately. Project-required commands operate only in an initialized current working directory, and `deliberate init` installs the project-local `/sonorance` review skill used by the UI's address-comments guidance.

## Analyze any idea or signal

`/deliberate case <idea>` has no lens switch for the user. The host infers the primary commitment, asks only when the decision is genuinely ambiguous, and records one durable lens:

| Lens | Decisions |
|---|---|
| **product & experience** | Create, change, simplify, or remove a customer capability or experience. |
| **market & commercial** | Choose an audience, positioning, pricing, packaging, channel, launch, or sales motion. |
| **strategy & portfolio** | Choose where to play, how to win, what to prioritize, fund, sequence, or stop. |
| **platform & ecosystem** | Build, buy, adopt, integrate, migrate, partner, standardize, or accept a dependency. |

Every case follows `frame → shape → launch`, but each lens selects different methods and templates. Frame establishes the decision and evidence; Shape compares alternatives and recommends a direction; Launch makes the recommendation actionable. Score evaluates the completed recommendation through the same lens. The product case produces a reverse PR-FAQ and may get a source-grounded prototype that walks every shaped journey step in the product surface's native medium; the market case produces a market decision brief and may get a focused customer-touchpoint artifact that tests its claim, proof, action, and observable response. No prototype is forced for strategy or platform cases; they get decision memos instead.

## Commands

```text
deliberate help [--skill]
deliberate init
deliberate serve [--open] [--port <n>] [--file <path>]
deliberate install [--here|--project <dir>]
deliberate case "<idea>" [--lens <product|market|strategy|platform>]
deliberate case list
deliberate case analysis prompt|save [id] [--file <path> | --note <text>]
deliberate case score prompt [id]
deliberate case score save [id] --model <id> [--independent] [--file <path>]
deliberate case one-pager prompt|save [id] [--file <path>]
deliberate case prototype prompt|save|list [id] [--surface <slug>] [--file <path>]
deliberate brief prompt|save|list
deliberate readout prompt|save|list
deliberate readout chart --spec <json> --output <svg>
deliberate matchup prompt|save|list [competitor]
deliberate source [list | add <location> ["<description>"] [--section <section>] | remove <location>]
deliberate feedback ["<message>"] [--category <category>] [--rating <rating>] [--file <json>]
deliberate comment list
deliberate comment <commentId> resolve [--note "<text>"] [--revised]
```

Project files are automatic grounding: `init` reads relevant files inside the current folder directly. `source add` is only for external URLs or local paths outside that folder; in-project files are rejected rather than recorded in `.sonorance/sources.md`.

Project context is split to keep edits single-sourced: `product.md` contains core product context and links only from its Competitors and Ecosystem sections; `competitors.md` owns the complete competitor roster, details, and monitoring sources; `ecosystem.md` owns the complete ecosystem roster, details, and monitoring sources. Every workflow receives all three files.

The underlying `--lens` option is host orchestration; users normally run `/deliberate case <idea>` without it. Run `deliberate help --skill` for generated, current command guidance.

## Files

```text
.sonorance/
  config.json
  plugins.json
  sources.md               # external grounding sources only
  local/
deliberate/
  context/
    product.md
    competitors.md
    ecosystem.md
  cases/<YYYY-MM-DD-slug>/
    analysis.md
    score.md
    one-pager.md
    prototype/[<surface>/]index.html  # product/market cases only, built on request
    log.jsonl
  briefs/<YYYY-MM-DD>/brief.md
  readouts/<YYYY-MM-DD[-N]>/
    readout.md
    charts/<metric>.svg
  matchups/<competitor-slug>/matchup.md
```

## Repository map

```text
src/engine/   prompt builders, persistence, role configuration, and commands
src/cli/      the deliberate binary
roles/        generic instructions, templates, and methods
skill/        the shipped /deliberate skill and launcher
test/         offline engine, CLI, contract, and skill tests
```
