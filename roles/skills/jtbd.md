# Jobs-to-be-Done (JTBD) — Method

> Use this whenever you **frame a problem** (Frame) or **design a surface** (Shape, Prototype).
> A job is the *progress a user is trying to make in a situation* — never a feature, never a demographic.

## 0. Find the personas & jobs from evidence (don't invent them)
Before framing anything, **infer who the users are and what jobs they're doing from the evidence**: the attached **sources (code, docs)** and the **content of the case**. Read the repo/docs for the surfaces, roles, and workflows the product already serves; read the case for who is hurting and why. Each persona and job must trace to that material — never conjure a persona, job, or demographic the evidence doesn't support (label genuine inferences as assumptions).

Then **scan for additional affected personas**: who else feels the ripple effects of this problem? Look one step out from the obvious user — the **admin/approver upstream**, the **downstream consumer** of their output, the **teammate or peer** who depends on them. Include the ones whose jobs are **materially** affected (grounded the same way); skip incidental bystanders. For each, name *how* the problem touches their job.

## 1. Job statement — the lean format (what Frame outputs)
**Group jobs under the persona who has them.** The persona line carries the *who* and the situation; each job is a single bullet, matching the Frame template:
**"I want to [job to be done], so I can [outcome]."**
- Keep it **solution-free** — no product or feature names.
- It's a *job*, not a feature request or a demographic. (Underneath, every job still answers "When [situation], I want to [motivation], so I can [outcome]" — but the situation lives in the persona framing, so the bullet stays lean.)
- A few **key** jobs per persona — don't bundle unrelated jobs into one line, and don't pad with minor ones.

## Going deeper — for the design stages (Shape & Prototype)
> Frame stays lean: personas + their key jobs. The tools below are for the design stage (Shape), which must move a *specific* job through a real UX. Don't make Frame produce a full workup.

### The struggling moment (optional)
When it fits the product/scenario, name the **specific, observable moment of friction** that makes the user start looking for a better way — concrete ("it's 11pm and I have 40 unread feedback items and a roadmap review tomorrow"), not abstract ("they're busy"). Some jobs are ongoing or ambient rather than triggered by a sharp moment; **don't force a struggling moment where there isn't one.**

### Three dimensions
A job usually has three dimensions — cover the ones that matter for the design:
- **Functional** — the practical task to accomplish.
- **Emotional** — how they want to feel, or stop feeling (e.g., in control, not anxious, confident).
- **Social** — how they want to be *perceived* by others (their team, boss, peers, investors).

### Job map — the steps of getting the job done
The job has stages even when no product exists. Use the steps that apply:
**Define → Locate → Prepare → Confirm → Execute → Monitor → Modify → Conclude.**
For each relevant step, note **today's friction**. Good UX supports the *steps of the job*, not just one button.

### Forces of progress (why they switch — or don't)
- **Push** (pain of the current situation) + **Pull** (attraction of the new way) drive change.
- **Habit** (inertia of today) + **Anxiety** (fear of the new) resist it.
Design must **amplify pull and reduce anxiety** (e.g., show the evidence to build trust).

## Anti-patterns (reject these)
- A persona is not a job. A feature is not a job. "Be more productive" is too vague to act on.
- A solution smuggled into the job statement ("I want a dashboard…").
- A persona or job invented without support in the sources or the case.
