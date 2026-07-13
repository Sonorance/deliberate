# Prioritization

> How **Score** turns the AI-era **win-conditions** (defined in the `win-conditions` skill)
> into a single go / no-go score. The win-conditions say what makes a **product** win over
> time; Score scores a single **Case** — so the test is whether the Case **advances or
> unblocks** those win-conditions, **not** whether one Case embodies all of them. Score
> **project-relative** (against *this* project's strategy/objective from the derived context),
> grounded in the Frame artifact (the problem + competitive landscape), on a **0–10** scale.
>
> **Reason fully, then explain clearly.** Work through the factors internally, then publish a
> short, **human-legible** brief (see "Output") — not the raw factor table or math.

## The one rule: score the problem, not the solution
Score runs **before** anything is designed or built, so ignore every solution-side variable
— **effort, size, feasibility, build cost, and "how hard is it to build" are out of scope.**
When building is nearly free, that a thing *can* be built tells you nothing. Judge only the
**opportunity**.

## What gates, and what only lifts
Not every good Case is a moat. Some **drive** a win-condition (build the flywheel, own a new
channel); many **enable** one (remove a limitation, reach parity, unblock or **broaden the
audience**). Both can be high-value — so separate the *necessary* conditions from the *value
multipliers*.

**Kill-gates — the case-level necessities (a Case must clear all three):**
- **Durable, AI-proof demand** — a real, important need that ubiquitous AI makes *more*
  valuable, not obsolete. No real demand → dead.
- **Reachable audience** — the people who need it can actually get and adopt it (AI-era
  distribution at the Case level). A Case that **broadens** the audience scores *well* here —
  it is not penalised for it.
- **On-strategy & trust-safe** — it advances (or at least doesn't contradict) this project's
  strategy, and it doesn't erode trust or violate a non-goal. A non-goal / hard-constraint
  violation is an automatic **reject**.

**Value multipliers — raise a passing Case, never gate it:**
- **Compounding flywheel / moat** — how much durable, proprietary advantage it builds (data,
  network, switching costs). Strong = big upside; **weak is fine for an enabler.**
- **Differentiation, taste & delight, agent-readiness, personalization, openness, "why now."**
  (Full definitions in `win-conditions`.)

## Credit enablers and table-stakes (don't punish parity)
A Case that removes a key limitation, reaches competitive parity, or **broadens the target
audience** is legitimately valuable **even with no standalone moat**. Score it on the demand
it unlocks and the audience it opens, and recognise it **raises the ceiling** for future
flywheel and differentiation. **Never reject or dock an enabler merely for "not being a moat
by itself"** — that is the wrong test for enabling work. Where useful, name the moat-builder
it sets up next, but do not hold its absence against the enabler.

## Confidence is a modifier, not a factor
**Cap** any factor whose score rests on thin or second-hand evidence, and state the biggest
uncertainty. Strong scores need independent, grounded evidence — else the Evaluator will (rightly)
flag fabricated demand, reach, or advantage.

## How to aggregate — gates, then weakest-link + multipliers (NOT a weighted average)
**Do not average the factors.** A weighted mean lets a strong factor paper over a fatal flaw
and rewards bland, well-rounded Cases over the spiky ones that matter. Instead:

**Step 1 — Kill-gates.** If any of the three necessities (demand · reachable audience ·
on-strategy/trust-safe) is essentially absent (≤ 3/10), or a non-goal / hard constraint is
violated → **reject**; the score is that low necessity's value. No multiplier buys it back.

**Step 2 — Floor by the weakest necessity, then lift with multipliers.** For a Case that
clears the gates, the floor is set by the weakest of the three necessities (a chain is only as
strong as its weakest link). From there the **multipliers raise the score** — a strong
moat/flywheel or sharp differentiation pushes toward the top; their **absence does not pull an
enabler down**. An enabler with strong demand + audience and a weak moat is a **good** Case,
not a weak one.

**Step 3 — Verdict.** Map to the bands. Prefer a defensible whole or half number — the gate
logic is the point, not the decimal.

## Verdict bands (0–10)
Advisory input to the human's go/no-go decision:
- **≥ 7.0** → **advance** — real durable demand, a reachable (often broadened) audience,
  on-strategy; either a genuine driver *or* a strong enabler that unlocks a lot.
- **5.0 – 6.9** → **shelve** — clears the gates but limited; name the single thing that would
  move it (more demand evidence, a wider audience, or the moat it should set up).
- **< 5.0** → **reject** — fails a kill-gate: no real demand, no reachable audience, or
  off-strategy / trust-eroding.

## Output — a short, legible brief
Reason through everything internally, then emit a **structured, human-readable** summary
following the output template: a **Score + verdict**, a one-line "what this is," then **only the
1–3 factors that actually drive the score** (the binding constraint and the biggest lift) —
**not** a roll-call of kill-gates that merely clear (a passing gate is a pass, not a reason), and
**no "Net" / synthesis line**. Then **at most two concrete, checkable risks** (the specific thing
that could be wrong and how you'd know — not an abstract caveat), kept separate from the strengths,
and the single thing that would change the call. Fewer, sharper points beat completeness; keep each
one a clear sentence. Do **not** dump the raw factor table, the per-factor numbers, or the math.

## Anti-patterns
- **Punishing an enabler / table-stakes Case for lacking a standalone moat or flywheel** —
  removing a limitation and broadening the audience *is* the value; score it on that.
- **Citing kill-gates that merely clear as justification for the score** — a passing gate is a
  pass, not a driver; name only the factors that actually move the number.
- **A "Net" / synthesis line, more than three drivers, or abstract non-actionable risks** — cut them.
- **Computing a weighted average / summing the factors** — use gates + weakest-link + multipliers.
- Letting a strong multiplier (moat, taste) paper over **no real demand or no reachable audience**.
- Scoring how easy/cheap the solution is to build (effort — out of scope).
- Importing another product's metric or strategy — score against **this** project's.
- A verdict with no score; a dense, self-conflicting paragraph instead of the structured brief.
