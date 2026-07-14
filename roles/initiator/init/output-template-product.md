# {{name}} — project context

_Written during `/deliberate init`: the host reads this project's files + your attached external sources and fills every
section below with real, grounded content (replace the guidance). This grounds every case, brief, and
analysis — and future PM / exec / marketing / business-development / strategy work, not just product
decisions. Keep it concise and use lists for enumerations. **Never fabricate.** If a section isn't covered by
the project files or the attached external sources, don't guess or invent — write `Not covered by the provided sources — add a
source or fill in manually.` for that section, and ask the user to point to a source that has it (or provide
the details)._

## Overview

_1–2 sentences: what the product is and who it's for._

## Value proposition & positioning

_The crisp positioning — what makes this compelling and hard to beat. One positioning statement plus the
single sharpest point of differentiation (the moat, if any). Grounds messaging, the go-to-market analysis,
and competitive strategy._

- _Positioning — for [persona] who [need], [product] is a [category] that [key benefit], unlike [alternative]._
- _Differentiation / moat — the one defensible edge (or "table-stakes — no durable edge yet")._

## Personas

- _Persona — who they are, in one line._

_Include **AI agents** as personas wherever the product exposes an interface they can drive (API, MCP,
tools / functions, an agent integration) — the agent is a user with its own jobs-to-be-done, not just a
channel._

## Jobs-to-be-done

- _The progress a user is trying to make (situation → desired outcome)._

## Interfaces

_The surfaces the product exposes (web app, API, CLI, agent skill, MCP tool, physical device, …) — and,
crucially, **which are primary**. Mark each `primary` or `secondary`. A surface is **primary** only if it
carries a hero journey, is the acquisition/activation wedge, delivers the core value repeatedly (retention),
or is where monetisation happens; everything else (admin, config, secondary integrations) is `secondary`.
**Be conservative — default to a single primary surface;** name a second (rarely a third) only when the
product is genuinely multi-sided. For each **primary** surface, name the hero job it carries and its
strategic role (acquisition / activation / core-value / monetisation / expansion). Only primary surfaces get
shaped into journeys and prototyped._

- _Surface — `primary` | `secondary` — one line; if primary: the hero job it carries + its strategic role._

## Competitors

See [competitors.md](./competitors.md) for the canonical competitor roster, details, and monitoring sources.

## Ecosystem

See [ecosystem.md](./ecosystem.md) for the canonical ecosystem roster, details, and monitoring sources.

## Market

_The wider space the product operates in — grounding (with the roster in [ecosystem.md](./ecosystem.md)) for the periodic
landscape brief's market lens (`/deliberate brief`), and useful to the go-to-market analysis. The *space*,
not the *players* (named actors go under **Ecosystem**). Real, named things only; each bullet names its kind.
List: the market / category; the standards & protocols the product participates in or depends on; and the key
technologies or trends shaping this space that are worth watching._

- _Market / category — the space this competes in._
- _Standard / protocol — one the product participates in or depends on (name + where it's governed)._
- _Technology / trend to watch — one shaping this space._

## Business model & pricing

_How the product makes (or will make) money. The revenue model and the pricing / packaging — or the current
state if pre-revenue. Grounds pricing analysis, the go-to-market analysis, and business-development work._

- _Revenue model — how value is captured (subscription, usage, seats, marketplace, free / open-source, …)._
- _Pricing / packaging — the tiers or price points (or "pre-revenue" if not yet monetised)._

## Distribution & channels

_How the product reaches its users — today and intended. The dominant go-to-market motion and the specific
channels. Grounds the market stage (how it spreads) and go-to-market / partnership work._

- _Motion — the primary go-to-market motion (product-led, sales-led, community-led, partner-led, …)._
- _Channel — a specific channel that acquires or activates users (and how well it works, if known)._

## Customer voice

_The few durable, decision-useful sources where customer needs, friction, requests, and sentiment can be inspected. List the source and what signal it contributes. If a product-owned GitHub repository is a configured source, verify it is public and Issues are enabled; then include its `/issues` page here. Never list an inaccessible or disabled tracker._

- _Source — location — customer signal available here._

## Metrics & traction

_The durable semantic contract for how product performance should be read. Define the project's readout cadence and timezone, then what each decision-relevant metric means and how it aggregates over that shared period. Do not copy current values, dated baselines, targets, or other snapshots here: init may run once, while those values belong to the live source._

- _Readout period — cadence and calendar alignment; timezone. Default: completed calendar week, Monday–Sunday, in the project's timezone. Every metric and evidence source uses this period; comparison is the immediately preceding equivalent completed period._
- _North-star metric — definition; source/query; desired direction; aggregation over the readout period; important segments._
- _Key metric — definition; source/query; desired direction; aggregation over the readout period; important segments._
- _Guardrail — definition; source/query; undesired direction; aggregation over the readout period._

## Strategy & principles

- _A guiding principle or strategic bet._

## Objective

_The current top objective._

## Non-goals

- _Something the product deliberately does not do._
