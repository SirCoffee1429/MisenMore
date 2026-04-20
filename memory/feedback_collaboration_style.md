---
name: MisenMore collaboration style
description: How Ryan prefers to work on MisenMore phase work — ambiguity first, fold cleanup into active phase, verbose handoff docs
type: feedback
---

When starting phase work on MisenMore, surface all ambiguities up front as a numbered list with a concrete proposed sequence before writing any code. Ryan answers them in order with terse confirmations (e.g. "1. fold in 2. yes remove 3. delete 5. yes confirm, Postmark option c for now") and expects that to be the full alignment step.

**Why:** Observed across Phase 6 — the session moved fastest when I proposed 5 clarifying questions + a file-by-file sequence, got terse answers, and went. When questions were implicit or late, rework followed.

**How to apply:**
- Before touching code for a new phase, always produce: (a) current-state observations from reading the target files, (b) a numbered ambiguity list, (c) a proposed file-by-file execution sequence. Wait for acknowledgement before starting.
- When editing files for a scoped change (e.g. "org-scope this query"), fold in adjacent cleanup — stale legacy links, dead imports, obsolete helpers — rather than deferring. Ryan explicitly confirmed this preference in Phase 6: "fold in". Cleanup-as-separate-pass is churn.
- Detailed multi-paragraph CHANGES.md entries and a fully-rewritten `prompt.md` at session end are expected, not optional. Ryan uses prompt.md as the cold-start context for the next session.
- Terse code review / confirmation is fine. Ryan doesn't want chatty confirmations of each file — a summary at phase end is enough.
