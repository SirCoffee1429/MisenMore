# MisenMore — Implementation Plan

## Overview

MisenMore is built from scratch with multi-tenancy as a first-class concern. The
foundation is DailyBrief's UI and component code, but every table, query, route,
and auth decision is designed for multiple orgs from day one. There is no
migration or backfill — the schema is clean from the first commit.

This file is the forward-looking roadmap. Completed phases are summarized below
for context; full historical detail lives in `.claude/changes_made/CHANGES.md`.
Phase 7.5+ is the active and upcoming work.

---

## Status

- [x] Phase 0 — Project setup
- [x] Phase 1 — Project foundation (DailyBrief code copied, configured)
- [x] Phase 2 — Database schema (all tables with org_id from day one)
- [x] Phase 3 — Supabase Auth + JWT custom claim hook
- [x] Phase 4 — Auth/Org React contexts + Login + ProtectedRoute
- [x] Phase 5 — Route structure (`/k/:orgSlug`, `/o/:orgSlug`)
- [x] Phase 6 — Org-scoped queries on every read and write
- [x] Phase 7 — RLS policies on all 11 domain tables
- [x] Phase 8 — Admin panel + Postmark per-org routing (shipped 2026-04-26)
- [ ] **Phase 7.5 — Anon kitchen JWT hardening** ← next commit
- [ ] Phase 9+ — Backlog (see end of file)

**Phase numbering note:** Phases are numbered logically, not chronologically.
Phase 7.5 ships after Phase 8 because the security scope was discovered after
Phase 8 was already in flight. Phase 7.5 must land before the first real
customer org is provisioned via the Phase 8 admin panel.

---

## Completed phase summaries

Full detail for each is in `CHANGES.md`. One-line summaries kept here for
roadmap context.

**Phase 1 — Project foundation.** Copied DailyBrief `app/` and `supabase/` into
MisenMore repo, configured `.env.local` for the new Supabase project
(`unqflkmrdfmxtggrcglc`), removed `OfficeGate.jsx`, verified local boot.

**Phase 2 — Database schema.** Created 13 tables (organizations, org_members,
plus 11 domain tables) all with `org_id` from creation. Added pgvector, indexes,
`current_org_id()` and `match_chunks(p_org_id)` helpers.

**Phase 3 — Auth + JWT hook.** Enabled email/password auth. Wrote
`custom_access_token_hook` to stamp `org_id`, `org_slug`, `role` from oldest
`org_members` row into JWT `app_metadata`. Hook enabled in dashboard.

**Phase 4 — React auth contexts.** Built `AuthContext` (office, session-based),
`OrgContext` (kitchen, slug-based), `withOrg()` helper for write payloads,
`Login.jsx`, `ProtectedRoute.jsx`. Sign-in lands user on `/o/:orgSlug` per JWT.

**Phase 5 — Route structure.** Wired `App.jsx` route tree with `/k/:orgSlug/*`
(kitchen, anon) and `/o/:orgSlug/*` (office, auth-gated). Layouts read slug from
context, no hardcoded paths.

**Phase 6 — Org-scoped queries.** Updated 27 call sites: every
`.eq('org_id', orgId)` on anon reads, every `withOrg()` on writes. All 7 edge
functions stamp org_id (initially via `TEST_ORG_ID` constant — replaced in Phase
8). `SalesBriefing` moved to office-only.

**Phase 7 — RLS policies.** Enabled RLS on all 11 domain tables. 44
authenticated policies (4 per table, gated on `org_id = current_org_id()`). 12
anon policies per the kitchen allowlist (`using (true)` because anon JWT didn't
carry org_id yet — Phase 7.5 fixes this). Cross-tenant verified with throwaway
`test-org-b`. Known followups: anon `using (true)` is app-side isolation only;
`kitchen_upcoming_events` view default-ACL gotcha.

**Phase 8 — Admin panel + Postmark routing (shipped 2026-04-26, commit
`7bf7be3`).** Replaced `TEST_ORG_ID` hack with plus-addressing routing
(`organizations.inbound_email_key` + `org_id_for_inbound_key()` helper). Built
`/admin` panel + `admin-mutations` edge function gated on new
`is_platform_admin` JWT claim sourced from `platform_admins` table. Added
`org_members` RLS policies (closed Phase 7 followup). Updated token hook to
stamp `is_platform_admin` for all authenticated users.

---

## Phase 7.5 — Anon kitchen JWT hardening (next)

**Status:** Spec locked, no migrations applied, no code written. Full spec lives
in `memory/project_auth_decisions.md` and
`memory/project_supabase_default_acl_gotcha.md`. Do not duplicate spec here —
read those files before implementation.

**Why this phase exists:** Phase 7 left anon RLS on `using (true)` because the
kitchen client used the raw anon key with no per-request org context. That made
cross-tenant isolation app-side only (`.eq('org_id', orgId)` in every kitchen
query). Single-tenant production is fine; multi-tenant production is not. Phase
7.5 closes this before any second org is provisioned via the Phase 8 admin
panel.

**Scope summary:**

- New tables: `kitchen_sessions` (office-managed link tokens, hashed) and
  `kitchen_claims` (PK on `auth_user_id`, denormalized `org_id` and
  `session_id`).
- New RPC: `claim_kitchen_session(p_token text)` SECURITY DEFINER —
  hash-compare, upsert claim, increment counters.
- New helper: `current_role_claim()` — reads `app_metadata.role` from JWT, used
  by anon RLS policies.
- Token hook rewrite: branch on `is_anonymous` claim. Anon → resolve via
  `kitchen_claims`, stamp `role: 'kitchen_anon'`. Authenticated branch preserved
  byte-accurate from Phase 8.
- 12 anon policies rewritten: replace `using (true)` with
  `current_role_claim() = 'kitchen_anon' AND org_id = current_org_id()`.
- `management_notes`: add `is_cleared`, `cleared_at` columns. Soft-delete only —
  no anon DELETE policy. Column-restrict UPDATE.
- `briefing_tasks`: column-restrict anon UPDATE to `is_completed` only.
- Drop `kitchen_upcoming_events` view; anon now reads `upcoming_banquets`
  directly via real RLS.
- New page: `/k/:orgSlug/claim/:token` (path param, not query string) —
  `KitchenClaim.jsx` calls RPC, refreshes session, redirects.
- New page: `/o/:orgSlug/kitchen-links` — office UI for token management.
- New edge function: `kitchen-link-mutations` (NOT extending `admin-mutations` —
  different auth model: same-org owner/manager, not platform admin).
- Frontend updates: `OrgContext`, `EightySixFeed` (soft-delete via `is_cleared`
  UPDATE), `EventsBanquetsPage` (revert kitchen path to read `upcoming_banquets`
  directly).

**Migration file:** `20260427000000_phase7_5_anon_jwt_hardening.sql` (single
file, ~250 lines, sectioned with comment dividers).

**Prerequisites (manual, not in SQL):**

- Anonymous Sign-Ins enabled in Supabase Auth → Providers (already on as of
  2026-04-26).
- Run console verification: `await supabase.auth.signInAnonymously()` returns a
  session.

**Verification plan:**

1. Re-seed `test-org-b` with deterministic uuid
   `11111111-1111-1111-1111-111111111111`.
2. Apply migration via MCP.
3. Run 7 cross-tenant attack tests (a–g) per locked spec in
   `project_auth_decisions.md`.
4. `vite build` clean.
5. Tear down `test-org-b`.
6. Single commit: migration + frontend + edge function + CHANGES.md entry +
   refreshed `prompt.md`.

---

## Phase 9+ — Backlog (unscoped, no commit order yet)

Items below are tracked future work. Each is a candidate phase, not a
commitment. Order is reassessed before each phase is opened.

**Captcha on anon sign-in.** Cloudflare Turnstile or hCaptcha, configurable on
the Supabase Auth Providers page. Without this, a bot loop hitting
`/k/:slug/claim/:token` creates unlimited anon `auth.users` rows. Schedule
before first real customer org is provisioned. Likely Phase 9.

**`auth_leaked_password_protection` advisor warning.** Carried forward from
Phase 7 and Phase 8 followups. Worth enabling alongside captcha work, same
phase.

**Settings dropdown in office nav.** Phase 7.5 ships `/o/:orgSlug/kitchen-links`
as a standalone route. Long-term that page belongs in a Settings dropdown
alongside org profile, billing, integrations, member management. The dropdown
shell is a UI refactor that touches every office page's header — out of scope
for the security-focused Phase 7.5.

**Self-serve org creation.** Currently every org goes through the platform admin
panel. Self-serve sign-up flow + billing integration is a major phase on its
own.

**Billing.** Stripe or similar. Untouched as of Phase 8. Required before
customer #2 unless platform admin manually waives.

**Anon user cleanup job.** Anon users created by `signInAnonymously()` who never
claim a kitchen session linger as orphan `auth.users` rows. Periodic cleanup:
`delete from auth.users where is_anonymous = true and created_at 
now() - interval '30 days' and id not in (select auth_user_id from
kitchen_claims)`.
Run as a Supabase scheduled function or cron.

**Per-device kitchen auth.** Phase 7.5 uses one anon `auth.users` row per org
(multi-device shares the user). Per-device auth users would let office revoke a
single tablet without affecting others, and audit per-device activity. Bigger
schema change — multiple `kitchen_claims` rows per session, revoke surface needs
per-claim controls. Defer until per-device audit is an actual requirement.

**Realtime kitchen-link revoke.** Phase 7.5 revoke takes effect on next JWT
refresh (~1hr drift). Realtime channel + client-side check would force instant
disconnect. Defer unless an incident makes the 1hr drift unacceptable.

**Cleared alerts history view.** Phase 7.5 soft-deletes alerts via `is_cleared`.
Office may want a "cleared history" tab to see what was 86'd recently. UI-only —
data is already retained.

**`extension_in_public` advisor warning on `vector`.** Carried forward from
Phase 2. Low priority, no functional impact.

---

## Build order dependencies

**Phase 7.5 prerequisites:**

- Anonymous Sign-Ins enabled in Supabase dashboard (manual)
- Phase 8 token hook landed (Phase 7.5 extends it, doesn't replace it)

**Future-phase prerequisites:**

- Captcha (Phase 9): no hard dependency, but should land before customer #2
- Self-serve org creation: blocked by billing

---

## Success criteria (rolling)

Per-phase success criteria are in CHANGES.md. Cross-phase platform criteria that
must hold at all times:

- [x] Manager signs in at `/login`, lands on `/o/:orgSlug`
- [x] Kitchen crew visits `/k/:orgSlug`, sees briefings / recipes / tasks
- [x] Kitchen crew cannot reach sales, BEO financials, or management comms
- [x] All edge functions stamp org_id on every write
- [x] RLS blocks anon access to `sales_data`, `banquet_event_orders`,
      `workbook_chunks`
- [x] `OfficeGate.jsx` and hardcoded passwords do not exist in this codebase
- [x] All queries use `withOrg()` on writes and `.eq('org_id', orgId)` on anon
      reads
- [x] First org provisioned via `/admin` panel, not manual SQL
- [x] Postmark inbound resolves org via `inbound_email_key`, not hardcode
- [ ] **(Phase 7.5)** Anon kitchen JWT carries `org_id`; RLS — not app-side
      `.eq()` — is the cross-tenant barrier
- [ ] **(Phase 7.5)** Two orgs provisioned, anon kitchen of org A cannot read or
      write org B's rows even with crafted `.eq()` queries
