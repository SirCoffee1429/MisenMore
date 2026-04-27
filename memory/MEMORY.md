# MisenMore Memory Index

*You should read all of the following markdown documents when you begin a new
session. and all files inside the /memory folder*

* [Project Context](project_context.md) — What MisenMore is, why it was forked
from DailyBrief, repo/Supabase details, current phase pointer
* [Auth \& Multi-Tenant Decisions](project_auth_decisions.md) — Org routing, role
model, kitchen anon access via signed JWT, RLS strategy
* [Phase Workflow](project_phase_workflow.md) — Each phase is a single commit
with a CHANGES.md entry and a refreshed prompt.md handoff
* [Postmark Multi-Tenant Plan](project_postmark_test_org_hack.md) —
Plus-addressing via inbound\_email\_key; current TEST\_ORG\_ID hack is Phase 8
blocker
* [Supabase Default ACL Gotcha](project_supabase_default_acl_gotcha.md) —
Column-level REVOKE on anon is overridden by Supabase's public-schema
default\_privileges
* [Collaboration Style](feedback_collaboration_style.md) — Ambiguity-first, fold
cleanup into active phase, verbose CHANGES.md + prompt.md expected

