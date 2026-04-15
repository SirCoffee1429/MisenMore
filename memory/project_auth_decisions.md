---
name: Auth & Multi-Tenant Architecture Decisions
description: Org routing strategy, role model, kitchen anon access rules, JWT claims approach — all finalized decisions
type: project
---

All decisions below are finalized. Do not re-litigate them unless the user explicitly asks.

**Org routing:**
- Kitchen crew: `/k/:orgSlug/*` — no login, anonymous Supabase client
- Managers/owners: `/o/:orgSlug/*` — Supabase email/password auth
- Org context for kitchen: `OrgContext` resolves slug → org_id on mount via public organizations table lookup
- Org context for office: `AuthContext` reads org_id from JWT `app_metadata`

**Roles:** owner, manager, kitchen_staff

**Kitchen data boundary (Option A — final decision):**
- Kitchen crew NEVER sees sales data, revenue, BEO financials, or management comms
- Kitchen can access: briefings, tasks, recipes, weekly features, 86'd alerts, upcoming event names/dates, weather
- `SalesBriefing` component is office dashboard ONLY — not on kitchen dashboard
- Sales routes do not exist under `/k/:orgSlug`

**EightySixFeed special case:**
- Kitchen anon has full CRUD on `management_notes` where `category = 'alerts'`
- This is the ONLY table where anon has write access
- RLS policy scoped to category='alerts' only

**JWT custom claims:**
- `custom_access_token_hook` Postgres function stamps `org_id`, `org_slug`, `role` into `app_metadata` on every token issuance
- `current_org_id()` helper function reads from JWT for RLS policies
- `withOrg(orgId, row)` helper required on every INSERT/UPDATE payload

**Org creation:** Admin-provisioned for launch (manual via Supabase dashboard). Self-serve is a future phase.

**Why:** Retrofitting DailyBrief was too risky for Old Hawthorne's live data. Clean fork = multi-tenancy from day one, no migration needed.
