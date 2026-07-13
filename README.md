# Deliberate

Deliberate is a files-first toolkit for creating reviewable Markdown records in the current repository. The CLI builds prompts, validates role configuration, and persists artifacts; the host coding agent performs the reasoning.

## Install and run

Node.js 22.5 or newer is required.

```bash
npx deliberate-cli install
```

Use `/deliberate` in a compatible coding-agent harness. A typical first journey establishes the product and market baseline before creating a Case:

```text
/deliberate init
/deliberate brief

# Turn a grounded opportunity from the Brief into a Case.
/deliberate case "Opportunity surfaced by the landscape brief"

# Review the decision, then make it tangible and monitor product health.
/deliberate case prototype
/deliberate readout
```

Run `deliberate serve --open` to review the generated Markdown, inspect diffs, and leave anchored comments in Sonorance. Project-required commands operate only in an initialized current working directory.

## Commands

```text
deliberate help [--skill]
deliberate init
deliberate serve [--open] [--port <n>]
deliberate install [--here|--project <dir>]
deliberate case "<idea>"
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

Run `deliberate help --skill` for generated, current command guidance.

## Files

```text
.sonorance/
  config.json
  plugins.json
  sources.md
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
    prototype/[<surface>/]index.html
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
