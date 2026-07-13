# Metrics — Method

> Use this whenever you must state **how a product's success is measured**: the Metrics & traction of a
> project's context (`init`) and the telemetry-grounded metrics of a go-to-market (`market`). A good metric
> is one number that, if it moves, tells you the product is delivering more value — and that a team can
> actually influence. Ground every metric in real evidence. Project context records durable definitions and
> comparison semantics, never time-sensitive values or targets copied during init.

## The north-star — pick the one that matters
The **north-star metric (NSM)** is the single measure that best captures the value customers get (and that
the business captures in turn). Test a candidate against three checks:
- **Value:** does it go up only when customers get more of what they came for? (Not vanity — registrations,
  raw pageviews, and "total users" usually fail this.)
- **Leading, not lagging:** does it move *before* revenue, predicting it? (Revenue itself is the lagging
  result; the NSM is the input that drives it.)
- **Actionable:** can the team move it through the product? (Not a market-wide number nobody controls.)
Prefer a metric of *delivered value per unit time* (e.g. "weekly active teams that complete the core job")
over a stock ("total signups").

## The metric tree — inputs beneath the NSM
Decompose the NSM into the **input metrics** that drive it, so the context shows *what to pull*:
- **Acquisition → Activation → Engagement → Retention → Revenue → Referral** (the AARRR spine) — keep the
  stages that matter for this product.
- For each, name the **one** metric that best captures it (activation rate, D30/W4 retention, weekly active,
  expansion, referral rate, …).
- Distinguish **leading vs lagging** (activation & retention lead; revenue & churn lag) so the reader knows
  which are early signals.

## Guardrails — what must NOT get worse
Name a **counter-metric** for the NSM (the thing a naive push on the NSM would break — quality, latency,
trust, unit cost, support load). A metric without a guardrail invites gaming.

## The readout contract — make every read comparable

First record one project-level reporting contract:

- cadence and calendar alignment, defaulting to a completed Monday–Sunday calendar week;
- the project's named timezone;
- comparison with the immediately preceding equivalent completed period.

Then, for every metric, record the durable semantics needed to calculate it consistently over that shared period: exact definition, aggregation, source or query, unit, desired direction, and important segments. A user may override one readout with another completed calendar period or explicit date range; every metric and evidence source follows the override for that run, and the comparison becomes the immediately preceding equivalent period. The previous readout artifact is never the metric baseline.

## Craft rules
- **One north-star, a handful of inputs.** A dashboard of 30 metrics is not a strategy.
- **Keep context durable.** Never copy a current value, dated baseline, target, or mutable numeric boundary
  into init context. Link the live source that owns those values.
- **Compare like with like.** Preserve the report-level period, aggregation, alignment, timezone, and segment.
- **Tie metrics to the job.** The NSM should measure the persona's job-to-be-done getting done, not
  activity for its own sake.
- **Per-value, not per-vanity.** Reach/impressions/registrations are vanity unless they map to value.

## Anti-patterns (reject these)
- A vanity NSM (total users, pageviews, downloads) that rises without more value delivered.
- Revenue as the north-star (it's the lagging result; find the input that predicts it).
- A pile of metrics with no single north-star and no guardrail.
- A snapshot value or target copied into one-time init context where it will silently become stale.
- A metric calculated over a different period from the rest of the readout.
- A metric no one on the team can actually move.
