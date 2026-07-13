# Shape

## Concept

* **Summary:** _1–2 sentences._
* **Simplicity:** _short sentence about why this is the simplest, lowest-input way to deliver the value —
  built on the product's current capabilities — and what was deliberately deferred to avoid user-facing
  complexity._

## User journeys

_Numbered, **step-level** journeys on the product's **primary surface(s)** — each step a concrete,
surface-native move (a click/screen for a GUI, a command + output for a CLI, a request + response for an
API, a tool-call + result for an agent/MCP tool, an interaction + state for a device) — specific enough
for the Prototyper to mock step-by-step, grounded in the actual product. **Name the surface each journey
runs on.** Lead with the **primary journey**: the canonical story of the primary persona getting the core
job done on the primary surface, from their struggling moment (if any) through the moment of progress to
job done, and how they feel. Then cover the other key personas and jobs the Frame named — but **only where
the flow materially differs**; otherwise note just the divergence. Shape a journey on a second surface
**only if `product.md` marks it primary too** (a genuinely two-sided product); secondary interfaces are
context, not journeys._

### Primary journey — [Surface] · [Persona], [job-to-be-done]

1. _Struggling moment / entry point — where the user starts and why._
2. _Concrete, surface-native step: clicks X and sees Y / runs the command and gets Z / calls the endpoint
   and receives W._

```
[the concrete surface artifact for a step — a UI state note, a CLI command + its output, an API
request + response, or a tool-call + result]
```

3. _…through to the moment of progress and the outcome._

### Other journeys & variations

_For each other key persona and job: a full numbered journey **only if it differs materially**; otherwise
a short note of how it diverges from the primary journey. Only add a journey on a **second primary
surface** when `product.md` marks that surface primary._

#### [Persona 2 / Surface 2] — [job-to-be-done]

- _Same as the primary journey, except: … (added functional requirement / step / permission)._ **or** a
  full numbered flow if materially different.

## Out of scope

_The boundaries of **this concept** — specific things this case's solution deliberately does **not** do,
each grounded in what this case is about. Not the product's abstract non-goals, and no filler caveats._

1. _a concrete capability this concept deliberately leaves out (and why)_
