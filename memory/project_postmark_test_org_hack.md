---
name: Postmark edge functions use a hardcoded TEST_ORG_ID
description: process-sales-data and process-banquets stamp every row with a hardcoded test org UUID — Phase 8 must replace with real routing
type: project
---

As of Phase 6, `supabase/functions/process-sales-data/index.ts` and `supabase/functions/process-banquets/index.ts` both stamp every inserted row with `TEST_ORG_ID` — an env var that falls back to `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e` (the test org UUID). The dedupe delete in `process-sales-data` also scopes by this UUID.

This is option (c) from the Phase 6 Postmark alignment: "defer Postmark multi-tenancy to a later phase and hardcode the test org for now." Ryan explicitly approved this trade-off.

**Why:** Postmark inbound webhooks don't carry an org_id. Real multi-tenant routing requires either per-org inbound email addresses (e.g. `sales+<slug>@inbound...`) or a From-address → org_id mapping table. Neither is built yet. Rather than block Phase 6 on that design, we stamp the test org and flag it.

**How to apply:**
- Before the first real (non-test) org is provisioned, replace `TEST_ORG_ID` in both functions with real routing. This is a Phase 8 blocker. Do not deploy to a second org without fixing this — sales and banquet data will silently land in the test org.
- `process-beo` is NOT affected — it already accepts `org_id` in its payload because it's only invoked from the authenticated dashboard, never from Postmark.
- If the test org UUID changes (Phase 8 teardown), both edge functions must be updated before the teardown or Postmark ingestion will 500.
- Search for `TODO(Phase 8)` in `supabase/functions/` to find the current marker comments.
