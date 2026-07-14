# Landscape Scan — Method

> Use this whenever you work the competitive + market landscape: **setting up a project's context**
> (`init` — map the *current* field of named competitors and their monitoring sources, the ecosystem
> players and theirs, and the market/space) or producing a periodic **Brief** (the *changes* within a
> time window). The competition + market **lenses** (§1) and the **source discipline** (§2) are shared;
> the **timeframe** (§0), the filtering to executive-worthy *change* (§3), and the decision framing (§4)
> apply to the **Brief**. For `init` you are cataloguing the field, not reporting change — skip §0 and use
> §1–§2 to find and record the real competitors, the ecosystem players, their first-party sources, and the
> market signals worth watching.

## 0. Timeframe — the whole game (Brief only)
A brief reports **only what changed inside the window** you are given (`period_start → period_end`).
- The window is *since the last brief*, capped at **3 months**. If a change shipped, was announced, or
  was reported **before `period_start`, it does not belong in this brief** — a prior brief already owned
  it (or it is too old to be news).
- Date every finding against the window before you keep it. If you cannot establish that a change
  happened inside the window, **drop it** — do not pad the brief with undated evergreen facts.
- "No change" is a valid, valuable answer. An honest empty section beats invented motion.

## 1. Two lenses
**Competition** — the *named* competitors, details, and monitoring sources from `competitors.md`, their single source of truth. For each, scan the **first-party** signals in
`competitors.md` within the window:
- announcements / product blog, release notes / changelog, **roadmap** changes,
- **codebase activity** (public repos: notable commits, merged PRs, new modules, deprecations),
- pricing / packaging changes, docs for newly-shipped capabilities.

**Market & ecosystem** — the *space and players around the project*, one step wider than the named
competitors, grounded in `ecosystem.md` (the named players — dependencies, complements, channels, movers — each `current`/`potential`, with their details and monitoring sources) and
`product.md` → **Market** (the category, the standards & protocols the product participates in or depends on,
and the technologies/trends to watch). For each ecosystem player, scan its **first-party** signals in
`ecosystem.md` within the window (a dependency's releases / breaking changes / security advisories, a
complement's product & integration updates, a channel's marketplace or policy changes, a mover's spec /
roadmap / governance shifts); for the market, watch:
- new or upcoming **protocol / standard / spec** releases and version bumps,
- **new entrants** or adjacent players (including potential partners),
- **M&A, funding, partnerships, pivots, shutdowns**, and newly-relevant **technologies** or platform shifts.
Market events (funding, M&A) may cite a reputable secondary source when no first-party one exists;
competitor and ecosystem-player product claims should trace to their own channel wherever possible. If the
project context's Competitors, Ecosystem, or Market is thin, say what you could and could not ground — don't
invent players or standards to fill it.

## 2. Ground every finding in a source
Each highlight carries a **working link** to where you saw it — a changelog entry, a blog post, a commit,
a release tag, a filing. No link, no highlight. Prefer official / first-party sources; name the source in
the link text so the reader knows what they're clicking (`[Changelog](…)`, `[GitHub PR](…)`).

## 3. Filter hard — earn the executive's attention
The fewer bullets, the better. A finding only survives if it is **important, relevant to this project, and
potentially actionable**. Ruthlessly cut:
- routine dot-releases, dependency bumps, copy tweaks, minor bug fixes,
- vanity metrics and undirected "they posted a blog" noise,
- anything a manager would skim past.
Caps (hard limits, aim lower): **≤ 3 highlights per competitor**, **≤ 3 market highlights**, **≤ 3 Key
highlights** overall, and only the action items that are genuinely warranted. If a competitor had no
meaningful change, say **"No meaningful updates."** — don't manufacture one.

## 4. From findings to a decision
- **Key highlights** = the top (≤3) changes across *both* lenses — what the reader must know if they read
  nothing else. Draw them from the per-section findings; don't introduce new facts here.
- **Action items** = the *so-what* for THIS project, reasoned from the highlights: should a feature,
  research spike, or investment be started? A partnership explored? A new technology or standard adopted?
  A positioning or pricing response considered? Tie each action to the finding that motivates it. Only
  include actions that are warranted — an empty action list is fine when the window was quiet.

## 5. Be concise
Every bullet is **≤ 3 sentences, ideally 1–2** — straight to the point, no preamble, no hedging. The
brief is scanned in a minute; write it that way.

## Anti-patterns (reject these)
- A finding with no date, or dated outside the window.
- A highlight with no source link, or a link to a non-authoritative source presented as first-party.
- Padding a quiet window with minor releases to look thorough.
- Repeating a change a previous brief already reported.
- Editorializing / speculation dressed as fact; inventing funding, partnerships, or competitors.
