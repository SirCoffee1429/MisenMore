---
name: Auth & Multi-Tenant Architecture Decisions
description: Org routing, role model, kitchen anon JWT-stamped access, RLS strategy — all finalized decisions
type: project
---

All decisions below are finalized. Do not re-litigate them unless the user
explicitly asks.

**Org routing:**

- Kitchen crew: `/k/:orgSlug/*` — anonymous Supabase auth session
  (signInAnonymously), signed JWT carrying org_id
- Managers/owners: `/o/:orgSlug/*` — Supabase email/password auth
- Org context for kitchen: `OrgContext` resolves slug → org_id, then ensures an
  anon auth session, claims a `kitchen_sessions` token, refreshes the JWT
- Org context for office: `AuthContext` reads org_id from JWT `app_metadata`

**Roles:** owner, manager, kitchen_staff, kitchen_anon (added Phase 7.5 —
stamped into JWT for claimed anon sessions)

**Kitchen data boundary (Option A — final decision):**

- Kitchen crew NEVER sees sales data, revenue, BEO financials, or management
  comms
- Kitchen can access: briefings, tasks, recipes, weekly features, 86'd alerts,
  upcoming event names/dates, weather
- `SalesBriefing` component is office dashboard ONLY
- Sales routes do not exist under `/k/:orgSlug`

**Kitchen anon access (Phase 7.5 — current design):**

- `kitchen_sessions` table — durable office-managed tokens. Each row is one
  shareable kitchen link. Explicit revoke only, no auto-expiry.
- `kitchen_claims` table — maps anonymous auth users to a kitchen_session and
  therefore an org. One anon auth user per org for now (multi-device shares the
  user); revisit per-device auth users if audit-per-device becomes a need.
- `claim_kitchen_session(token)` — SECURITY DEFINER RPC. Anon caller with active
  anonymous Supabase session passes the token; function validates, upserts
  kitchen_claims row, bumps last_claimed_at. Caller then `auth.refreshSession()`
  so the token hook re-fires and stamps `org_id` / `org_slug` /
  `role: 'kitchen_anon'` into `app_metadata`.
- `custom_access_token_hook` extended to branch on `is_anonymous` claim — anon
  users resolve via kitchen_claims, authenticated users resolve via org_members
  (Phase 3 logic unchanged for that branch).
- RPC chosen over edge function for the claim flow (less code, no extra deploy,
  easier to audit).

**RLS posture (Phase 7.5):**

- Every domain table's anon policy reads
  `current_role_claim() = 'kitchen_anon' AND org_id = current_org_id()`. No more
  `using (true)`. RLS is the primary cross-tenant barrier; app-side
  `.eq('org_id', orgId)` stays as defense-in-depth.
- `briefing_tasks` anon UPDATE column-restricted to `is_completed` only via
  `revoke update ... grant update (is_completed) to anon`.
- `management_notes` alerts: soft-delete via new `is_cleared` + `cleared_at`
  columns. Kitchen UPDATE column-restricted to
  `is_cleared, cleared_at, content, pinned`. No anon DELETE policy.
- `kitchen_upcoming_events` view dropped — anon now reads `upcoming_banquets`
  directly via real RLS.

**EightySixFeed special case (post Phase 7.5):**

- Kitchen anon has SELECT/INSERT/UPDATE on `management_notes` where
  `category = 'alerts' AND org_id = current_org_id()`.
- Soft-delete only — `is_cleared = true` instead of hard DELETE.

**JWT custom claims:**

- `custom_access_token_hook` stamps `org_id`, `org_slug`, `role` into
  `app_metadata` on every token issuance for both authenticated and claimed-anon
  users.
- `current_org_id()` reads `app_metadata.org_id` from JWT.
- `current_role_claim()` reads `app_metadata.role` — used by anon RLS policies
  to require `kitchen_anon`.
- `withOrg(orgId, row)` helper required on every INSERT/UPDATE payload.

**Org creation:** Admin-provisioned for launch (manual via Supabase dashboard).
Self-serve is a future phase.

**Office-side kitchen link management:** new `/o/:orgSlug/kitchen-links` page
lists `kitchen_sessions` for the org, generates new tokens (32-byte URL-safe via
`crypto.getRandomValues`), and revokes via `UPDATE revoked_at = now()` + DELETE
on matching `kitchen_claims` rows.

**Why:** Retrofitting DailyBrief was too risky for Old Hawthorne's live data.
Clean fork = multi-tenancy from day one. Phase 7.5 closes the gap that Phase 7
left open: raw-anon-key access with `using (true)` policies meant anon
cross-tenant isolation was app-side only. Phase 7.5 makes RLS the real barrier.
