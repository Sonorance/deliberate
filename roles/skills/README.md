# Skills — reusable method and craft

These files are shared, product-agnostic methods injected into role prompts alongside the current project's context. They teach roles how to do the craft; they must not describe a specific product. Product-specific grounding is written by the host during `init` under `deliberate/context/` and supplied separately.

| File | Purpose | Used by |
| --- | --- | --- |
| `jtbd.md` | Jobs-to-be-Done analysis: situation, motivation, desired progress, alternatives, outcomes, and evidence | Init, Frame, Shape, Launch, Prototype, One-pager, Matchup |
| `positioning.md` | State the competitive alternative, unique attributes, value, audience, category, positioning statement, and defensible differentiator | Init, Launch, One-pager, Matchup |
| `metrics.md` | Select outcome measures, leading inputs, and counter-metric guardrails without confusing activity for value | Init, Launch |
| `product-readout.md` | Produce a defensible periodic read of configured metrics and customer evidence, including comparisons, evidence gaps, causality, and actions | Readout |
| `ux-principles.md` | Surface-neutral experience principles for clear, accessible, trustworthy product journeys | Shape, Prototype |
| `win-conditions.md` | Evaluate durable demand, value, fit, adoption, distribution, trust, and compounding advantage as build-toward goals | Score, Shape, Launch, Prototype |
| `prioritization.md` | Apply gates and a weakest-link rubric to produce an evidence-based 0–10 score and lean verdict, excluding effort | Score, Matchup |
| `critique.md` | Constructive, bounded criticism that strengthens a decision without creating endless review loops | Score |
| `landscape-scan.md` | Scan market and competitive evidence with source discipline, breadth, time-window filtering, and change detection | Init, Brief, Matchup |
| `head-to-head.md` | Research one named rival deeply across evidence, dimensions, SWOT, JTBD, battlecard, positioning, and opportunities | Matchup |
| `tech-constraints.md` | Keep prototypes, artifacts, and implementation guidance self-contained and integration-ready | Shape, Prototype, Matchup |

`roles/config.yaml` is the source of truth for which role receives each method. The engine re-reads it on every invocation, so changes apply to the next prompt.
