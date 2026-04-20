# MisenMore Memory Index

- [Project Context](project_context.md) — What MisenMore is, why it was forked from DailyBrief, repo/Supabase details, current phase pointer
- [Auth & Multi-Tenant Decisions](project_auth_decisions.md) — Org routing, role model, kitchen anon access, JWT claims strategy
- [Phase Workflow](project_phase_workflow.md) — Each phase is a single commit with a CHANGES.md entry and a refreshed prompt.md handoff
- [Postmark Test-Org Hack](project_postmark_test_org_hack.md) — process-sales-data and process-banquets stamp a hardcoded TEST_ORG_ID; Phase 8 blocker
- [Supabase Default ACL Gotcha](project_supabase_default_acl_gotcha.md) — column-level REVOKE on anon is overridden by Supabase's public-schema default_privileges; use table-level revoke + partial grant
- [Collaboration Style](feedback_collaboration_style.md) — Ambiguity-first, fold cleanup into active phase, verbose CHANGES.md + prompt.md expected
