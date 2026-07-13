# Product readout — method

> Use this for a periodic, project-scoped readout of product performance and customer evidence. The readout answers what materially changed, what the configured evidence supports, and what deserves action. It is not team-status reporting, a dashboard dump, or causal attribution by intuition.

## 1. Establish coverage before drawing conclusions

Read every relevant attached source the harness can access: product analytics, warehouses or exports, billing and commercial data, customer feedback, research, release and experiment logs, incidents, and the repo. For each expected source, establish:

- whether it was accessible;
- how fresh it is relative to the reporting period;
- what part of the product picture it covers;
- whether missing or partial coverage materially limits a conclusion.

State material coverage limits in the report. Never turn an inaccessible source into "no change" or silently substitute general knowledge for project evidence.

## 2. Use one completed reporting period

One completed reporting period grounds the entire readout: metrics, customer feedback, releases, experiments, incidents, takeaways, insights, and actions. The project's durable readout contract defines its cadence, calendar alignment, and timezone; the default is the previous completed Monday–Sunday calendar week. A user may override the period for one run with a completed natural-language range such as "for June" or "for Q2."

- Use only evidence dated inside the reporting period for the report's findings. Do not mix in events or metric observations from the period currently in progress.
- Calculate every metric over the reporting period using its durable definition, source/query, aggregation, and segment. The period is stated once at report level; do not repeat it in every metric row.
- Compare every metric with the immediately preceding equivalent completed period. For a calendar override, preserve its natural alignment: July compares with June, Q2 with Q1, and a calendar year with the prior year. An arbitrary date range compares with the immediately preceding range of equal duration.
- Preserve units, aggregation, period duration, alignment, timezone, segments, and metric definitions across readouts.
- For counts and amounts, show absolute and relative change. For rates, lead with percentage-point change; a relative change may follow when useful.
- Never compare against the previous readout artifact, the elapsed time since it ran, or an incomplete period.
- On the first readout, use the same immediately preceding equivalent period when the source has sufficient history. Otherwise show the reporting-period value and surface the missing comparator under Data gaps.

## 3. Calculate; do not eyeball

Use deterministic queries, exports, scripts, or calculator/tool results for arithmetic. The language model synthesizes meaning; it does not invent or visually estimate values.

Every reported number must carry a source link or traceable local-source reference. If two sources disagree, surface the disagreement rather than choosing the more convenient value.

## 4. Show material trends without turning the readout into a dashboard

Add a trend chart only when a decision-relevant key metric has at least four comparable completed observations; prefer six to twelve periods so the shape is more informative than two-point period-over-period change. Include no more than three charts.

- Generate charts deterministically from the normalized values used in the analysis; never ask a language model to draw SVG or infer points from a screenshot.
- Keep the table canonical: it carries the exact reporting-period and comparison values, while the chart reveals the longer trajectory.
- Use the readout's configured cadence, alignment, timezone, and the metric's stable aggregation and segment for every point.
- Preserve missing periods as gaps. Never smooth, interpolate, forecast, or add a target line.
- Use a zero-based quantitative axis so small movements are not visually exaggerated.
- Embed the generated SVG beneath Key metrics with descriptive alt text and a relative `charts/<metric>.svg` path.
- Skip charts when the source exposes only current/comparable values, the history is not consistently defined, or the series would disclose data that should not be committed.

## 5. Distill only decision-relevant signal

Prioritize:

- movement relevant to the current Objective;
- the North Star, its strongest inputs, material funnel changes, retention, revenue or efficiency where relevant, and guardrails;
- meaningful segment differences;
- notable changes that cross a configured business threshold;
- customer-feedback themes whose prevalence, specificity, or change matters;
- releases, experiments, campaigns, or incidents that provide context.

Do not force positive and negative symmetry. Call a movement an **anomaly** only when sufficient history and a defined statistical or business threshold support that term; otherwise call it a notable movement.

## 6. Keep observation, context, hypothesis, and causality separate

- **Observation:** what the evidence directly shows.
- **Context:** a release, experiment, incident, campaign, or environmental event in the same period.
- **Hypothesis:** a plausible explanation worth testing.
- **Causal finding:** only when an experiment or equivalent evidence supports attribution.

Temporal proximity is not causality. Never claim that a launch, campaign, or incident caused a metric change merely because the dates overlap.

## 7. Combine feedback prevalence with customer voice

Summarize meaningful feedback themes with the reviewed volume or denominator, source coverage, affected segment when known, and direction versus the comparison period when supported.

Use a short quotation when it adds specificity, language, or emotional texture:

- quote the source exactly; never create synthetic or composite quotations;
- choose a representative quotation, not merely the most dramatic;
- include a date and source link or traceable record reference;
- redact unnecessary identifying information without changing meaning;
- never let one quotation imply prevalence — report volume alongside it.

## 8. Turn findings into bounded action

Recommend only actions or decisions warranted by the findings. Each action states why it matters now and, when the evidence permits, the owner or decision-maker, timing, and success signal. "No immediate action warranted" is a valid conclusion.

## Anti-patterns

- A polished report built from inaccessible or stale core sources.
- Changes without reporting-period and comparable values and a named comparison.
- Conclusions influenced by a week, month, quarter, or other reporting period that has not fully closed.
- A reporting or comparison period that changes because the readout ran early, late, or after a gap.
- Relative percent change used as the primary movement for a rate where percentage points are clearer.
- A universal "health score" that hides mixed evidence.
- Raw metric dumps, vanity metrics, or exhaustive source summaries.
- Decorative charts, two-point charts, charts with inconsistent period grains, or more than three charts.
- Smoothed, interpolated, forecast, or target lines not present in the normalized source series.
- Generic recommendations that could appear in any project's report.
- Root-cause claims without causal evidence.
- Feedback sentiment without volume, coverage, or representative evidence.
- Repeating the previous readout without a material update.
