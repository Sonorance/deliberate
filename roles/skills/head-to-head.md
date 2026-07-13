# Head-to-Head — Method

> Use this whenever you produce a **single-competitor matchup** — a full, sourced read of one named
> product against ours, on demand. It is the sibling of `landscape-scan`: that skill scans the *field*
> for *change over time* (breadth); this one goes *deep on one named rival* at a point in time (depth).
> Reuse `landscape-scan` §2 (source discipline) verbatim; everything else here is matchup-specific. The
> goal is a document a PM can defend in a board review and assemble a competing deck from without
> re-researching.

## 0. Point-in-time, not a time series
A matchup is **the current read on one rival**, true as of a stated date — not a log of changes (that's
`brief`). Stamp the `as_of` date (in the body **and** the frontmatter), ground the read in what's live
*now*, and **refresh the single canonical doc in place** when the rival moves — don't spawn a new dated
copy (git holds the history; `brief` owns the change-over-time series and signals when a refresh is due).
If a claim was true six months ago but isn't now, it doesn't belong.

## 1. Steelman before you strike
**Argue the rival's case at its strongest first.** Per `AGENTS.md` ("do your stage's job objectively"),
a flattering matchup is worse than useless — it loses the deck in the Q&A. Establish, honestly, what they
do genuinely better and why a smart buyer picks them *before* you find the openings. Home-team bias is the
failure mode; catch it in yourself.

## 2. Ground every claim in a source (from `landscape-scan` §2)
Each factual claim carries a **working link** to a first-party source — their site, docs, changelog, repo,
pricing page, a release tag, a filing. Name the source in the link text. Mark each claim's confidence:
**fact** (first-party, cited) ▪ **inferred** (reasoned from evidence) ▪ **assumption** (stated as such).
Never present an inference or assumption as a fact. If the project context or the rival's public surface is
thin, say what you could and couldn't ground — don't invent features, pricing, funding, or adoption.

Grounding sources: `deliberate/context/product.md` (our positioning, personas, JTBD, strategy) +
`deliberate/context/competitors.md` (if the rival is already tracked, its monitoring sources) + the
attached sources + your own first-party research of the rival. If the rival isn't tracked yet, **ask the
user whether to add it** (default yes) to the Competitors roster in `product.md` and its monitoring sources
in `competitors.md` so `brief` starts watching it — closing the loop between the two commands.

## 3. Read across every dimension — who's ahead, and why
Work each dimension and end each with an honest **Edge: us / them / even — because…**. Cover, at minimum:

- **User journey** — first-run → habitual use; where activation is smoother.
- **UX / interaction** — model, polish, the moments that delight or grate.
- **Functional** — has / doesn't-have on both sides; parity and WIP.
- **Supported scenarios** — the genres each covers; the omission on each side.
- **Strategic** — the real threat (commoditization / substitution) and the real opportunity.
- **Marketing & positioning** — audience, message, tone; the head-to-head we'd lose.
- **Pricing & business model** — how each monetizes; where the wedge is.
- **Distribution & GTM** — how each acquires; where that's strong or brittle.
- **Implementation approach** — architecture / stack / runtime and its trade-offs.
- **Ecosystem & interoperability** — integrations, standards, partners; can they coexist / migrate?
- **Maturity & momentum** — version, cadence, adoption, funding, team size, bus factor, trajectory.

"Even" is a valid verdict. Don't manufacture contrast to look thorough.

## 4. Synthesize — SWOT, JTBD, and the value curve
- **SWOT the pair:** each side's real weakness is the other's opening. Name our weaknesses candidly.
- **JTBD coverage:** apply the `jtbd` method — the core jobs in this space, who gets each done, and the
  gap. Jobs, not features.
- **Strategy canvas:** rate the buyer's decision factors `high / medium / low` for both sides — the
  value-curve inputs. Where the two lines diverge is the story.

## 5. Turn the read into a decision
- **Battlecard:** **why we win** / **why we lose** (≤3 each, with proof), **landmines** (where competing on
  their terms is a trap — our do-not-compete), and **objection handling** (their best pitch line + our
  grounded answer).
- **Positioning against them** (apply `positioning`): the frame that moves the fight to our ground, plus
  the arena we deliberately cede.
- **Opportunities** (apply `prioritization`): **Borrow** (value ÷ effort; learn, don't copy — respect
  their license), **Partner / interop**, **Respond** (roadmap / pricing / positioning). Only what's
  warranted.

## 6. Leave it deck-ready (no separate deck section)
Don't add a slide outline or "deck kit" — the substance *is* the deck material. A good matchup already
carries everything a competing deck needs: a one-line thesis (Bottom line), the at-a-glance table, the
strategy canvas, the win/lose themes with proof, objection handling, and the prioritized bet — each
grounded and cited. Write those well and a human can assemble slides without re-researching.

## 7. Be concise
Every bullet **≤ 3 sentences, ideally 1–2**. Hard caps: ≤3 per battlecard lane, ≤3 opportunities per lane,
one tight block per dimension, 6–10 factors in the at-a-glance and canvas tables. The fewer bullets, the
better — earn every line.

## Anti-patterns (reject these)
- A home-team read that never says where we lose, or lists no real weakness of ours.
- A "fact" with no source link, or an inference/assumption dressed as a fact.
- Stale claims — anything not true as of the `as_of` date.
- Manufactured contrast where the honest answer is "even".
- Copying the rival's code/assets instead of learning from the pattern (mind their license).
- Padding every dimension to look exhaustive instead of cutting to what decides the contest.
- Bolting on a slide outline / "deck kit" — the substance already seeds the deck (§6).
