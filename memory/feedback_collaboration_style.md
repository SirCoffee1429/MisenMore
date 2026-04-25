---
name: MisenMore collaboration style
description: How Ryan prefers to work on MisenMore phase work — ambiguity first, fold cleanup into active phase, verbose handoff docs
type: feedback
---

When starting phase work on MisenMore, surface all ambiguities up front as a
numbered list with a concrete proposed sequence before writing any code. Ryan
answers them in order with terse confirmations (e.g. "1. fold in 2. yes
remove 3. delete 5. yes confirm, Postmark option c for now") and expects that to
be the full alignment step.

**Why:** Observed across Phase 6 and Phase 7.5 planning — both moved fastest
when I proposed numbered ambiguity lists and a concrete sequence, got terse
one-line answers, and went. When questions were implicit or late, rework
followed.

**How to apply:**

- Before touching code for a new phase, always produce: (a) current-state
  observations from reading the target files, (b) a numbered ambiguity list, (c)
  a proposed file-by-file or migration-by-migration execution sequence. Wait for
  acknowledgement before starting.
- When editing files for a scoped change, fold in adjacent cleanup — stale
  legacy links, dead imports, obsolete helpers, retired views — rather than
  deferring. Ryan explicitly confirmed this in Phase 6 ("fold in") and Phase 7.5
  (dropped `kitchen_upcoming_events` in same migration set as anon RLS rewrite).
  Cleanup-as-separate-pass is churn.
- Detailed multi-paragraph CHANGES.md entries and a fully-rewritten `prompt.md`
  at session end are expected, not optional.
- Terse code review / confirmation is fine. A summary at phase end is enough.
- Push back honestly when proposals weaken security or correctness. Ryan's
  userPreferences require it: "Never give me wrong information or answers just
  for the sake of agreeing." Phase 7.5 conversation started with him asking for
  an ELI5 of a `using (true)` warning and ended with a full anon-JWT redesign
  because the honest answer was "this is actually a serious cross-tenant
  vulnerability."
- When Ryan asks "is there another way to do X" mid-phase, give the real
  alternatives (with tradeoffs) and a recommendation, then return to the active
  phase. Don't let exploration derail commit discipline.
- At the end of each session look foor any orphaned CSS, JS, legacy code, or any
  other cleanup opportunities and address them in that same session. Do not
  create a separate task in notion for these items, that's too much work.
