# Technical Constraints — pipeline output

> How agents must **emit artifacts**. These are constraints of the Deliberate pipeline
> itself, independent of whatever product the operator is running it on. (The *operator
> project's* stack, personas, and strategy come from the auto-derived project context,
> not from here.)

## Prototype constraints
- A single self-contained `index.html`: inline CSS/JS, hardcoded data, no build step,
  no external network calls. It must open by double-clicking the file.
- **One prototype per PRIMARY surface** (init marks them): the single default surface is
  `prototype/index.html`; additional surfaces nest at `prototype/<surface>/index.html`.
  The `index.html` is always the openable container, but its **medium follows the surface**
  — a clickable GUI, a CLI terminal replay, an API request/response explorer, an
  agent-session replay, a storyboard. **Never fabricate a GUI for a non-GUI product.**

## Build Packet (the handoff artifact)
- Markdown + YAML only, never JSON files. `spec.md` (acceptance criteria as YAML
  frontmatter), `context.md`, `evidence.yaml`, `prototype/index.html`.
- Delegated to the repo's agent via an installed **skill file**
  (AGENTS.md / .github/skills) — Deliberate never pushes code itself.

## Integration
- Prefer official **MCP** servers (GitHub, LaunchDarkly); thin adapters for the rest.
- Read repo access is optional + scoped (read-only).
- Inference is model-agnostic (Copilot CLI by default, including the cross-vendor
  critic) — never hard-wire one model.
