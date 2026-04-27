---
name: Auth & Multi-Tenant Architecture Decisions
description: Org routing, role model, kitchen anon JWT-stamped access, RLS strategy — finalized decisions plus Phase 7.5 locked spec
type: project
---

All decisions below are finalized. Do not re-litigate them unless the user
explicitly asks. Sections tagged **(LIVE)** describe the current production
state. Sections tagged **(PHASE 7.5 — PLANNED)** describe spec that is locked
but not yet implemented. When Phase 7.5 ships, retag those sections to LIVE.

---

## Org routing (LIVE since Phase 3)

- Kitchen crew: `/k/:orgSlug/*` — currently raw anon-key access. Phase 7.5
  replaces this with `signInAnonymously()` + signed JWT carrying `org_id`.
- Managers/owners: `/o/:orgSlug/*` — Supabase email/password auth.
- Platform admin: `/admin` — top-level (not org-scoped) route, gated by
  `AdminRoute` on `is_platform_admin` JWT claim. Added Phase 8.
- Org context for office: `AuthContext` reads `org_id` from JWT `app_metadata`.
  After Phase 7.5, kitchen anon will read its `org_id` from the same place.

## Roles

`org_members.role` check constraint: `('owner', 'manager', 'kitchen_staff')`.
Phase 7.5 does NOT change this constraint.

`kitchen_anon` is a JWT claim value stamped by `custom_access_token_hook`, NOT a
row in `org_members`. Anon kitchen users have zero `org_members` rows — their
org binding lives in `kitchen_claims`.

`is_platform_admin` is a separate boolean JWT claim, NOT a role. Sourced from
the `platform_admins` table. Stamped on every authenticated user's JWT (true or
false, never null). Anon users do NOT receive this claim — they cannot be
platform admins by definition.

## Kitchen data boundary (Option A — final decision)

- Kitchen crew NEVER sees sales data, revenue, BEO financials, or management
  comms.
- Kitchen can access: briefings, tasks, recipes, weekly features, 86'd alerts,
  upcoming event names/dates, weather.
- `SalesBriefing` component is office dashboard ONLY.
- Sales routes do not exist under `/k/:orgSlug`.

## JWT custom claims (LIVE post Phase 8)

`custom_access_token_hook` stamps the following into `app_metadata` on every
token issuance:

**Authenticated users:**

- `org_id` — UUID from oldest `org_members` row (nullable for platform-admin-
  only users with no org membership)
- `org_slug` — string slug from `organizations` (nullable, paired with `org_id`)
- `role` — value from `org_members.role` (nullable, paired with `org_id`)
- `is_platform_admin` — boolean. Always stamped (true or false). Sourced from
  `exists(select 1 from platform_admins where user_id = uid)`.

**Anonymous users (after Phase 7.5):**

- `org_id` — UUID from `kitchen_claims.org_id` (only present if claim exists)
- `org_slug` — string from joined `organizations.slug`
- `role` — literal string `'kitchen_anon'`
- `is_platform_admin` — NOT stamped. Anon RLS policies require
  `role = 'kitchen_anon'`, so missing claim is irrelevant to authorization.

**Helpers:**

- `current_org_id()` reads `app_metadata.org_id` from the JWT, returns UUID.
- `current_role_claim()` reads `app_metadata.role` from the JWT — used by anon
  RLS policies after Phase 7.5 to require `kitchen_anon`. Added Phase 7.5.
- `is_platform_admin(uid uuid)` SQL helper checks `platform_admins` membership.
  Used by `org_members` RLS policies. Added Phase 8.
- `withOrg(orgId, row)` JS helper required on every INSERT/UPDATE payload —
  defense-in-depth, paired with RLS WITH CHECK.

## Org creation (LIVE since Phase 8)

Admin-provisioned via `/admin` panel, NOT manual dashboard inserts. The
`create_org` action in `admin-mutations` edge function:

- Validates slug + name
- Generates `inbound_email_key` (32-char random, unique-indexed)
- Inserts into `organizations`
- Returns the row to the admin UI

Self-serve org creation is a future phase. Until then, every new customer goes
through a platform admin.

## Kitchen anon access (PHASE 7.5 — PLANNED)

**Status:** Spec locked, no migrations applied, no code written. Until this
phase ships, kitchen anon RLS is still on `using (true)` and cross-tenant
isolation is app-side only via `.eq('org_id', orgId)`.

**Tables:**

`kitchen_sessions` — durable office-managed tokens. Each row is one shareable
kitchen link. Explicit revoke only, no auto-expiry.

- `id uuid pk`
- `org_id uuid not null references organizations(id) on delete cascade`
- `token_hash bytea not null` — sha256 of plaintext token. Plaintext is shown to
  office UI exactly once at creation, never recoverable. Lost token = revoke +
  reissue, no recovery path. Standard pattern (GitHub PATs, Stripe API keys).
- `label text not null` — office-set human label, e.g. "Main kitchen tablet"
- `created_by uuid references auth.users(id)`
- `created_at timestamptz not null default now()`
- `revoked_at timestamptz` — nullable, set by revoke action
- `last_claimed_at timestamptz` — nullable, bumped by RPC on each claim
- `claim_count int not null default 0` — cumulative count, incremented in RPC on
  every successful claim

`kitchen_claims` — maps anonymous auth users to a kitchen_session and therefore
an org. PK on `auth_user_id` (one anon user = one claim row, ever). Org switch
is a re-link, not a new row.

- `auth_user_id uuid pk references auth.users(id) on delete cascade`
- `session_id uuid not null references kitchen_sessions(id) on delete cascade`
- `org_id uuid not null references organizations(id) on delete cascade` —
  denormalized so the hook reads it without joining to kitchen_sessions
- `claimed_at timestamptz not null default now()`
- `last_claimed_at timestamptz not null default now()`

**`active_claims` is COMPUTED, not a column** —
`select count(*) from
kitchen_claims where session_id = X` at office page load.
`claim_count` is the persisted cumulative metric on `kitchen_sessions`. Two
different metrics, two different sources.

**Claim flow:**

`claim_kitchen_session(p_token text)` — SECURITY DEFINER RPC. Anon caller with
active anonymous Supabase session passes the plaintext token. RPC:

1. Hashes `p_token` with sha256
2. Looks up `kitchen_sessions` by `token_hash` where `revoked_at is null`
3. Returns error if not found / revoked
4. Upserts `kitchen_claims` row keyed on `auth.uid()` (ON CONFLICT
   `auth_user_id` DO UPDATE — re-claims for same org are idempotent refreshes;
   re-claims for different org silently switch the device's org)
5. Bumps `last_claimed_at`, increments `claim_count`
6. Returns `{ org_id, org_slug }` to the caller

Caller then runs `auth.refreshSession()` so the token hook re-fires and stamps
`org_id` / `org_slug` / `role: 'kitchen_anon'` into `app_metadata`.

**Claim flow on dedicated route:**

`/k/:orgSlug/claim/:token` — path param, NOT query string. Reasons: cleaner URL,
matches existing route style, avoids leaking token to analytics / referrers /
browser history search.

`KitchenClaim.jsx` page renders "Linking..." → calls `signInAnonymously()` if no
session → calls `claim_kitchen_session(token)` → calls `auth.refreshSession()` →
renders "Linked to {orgName}" for ~1.5s → redirects to `/k/:orgSlug`. No
interstitial, no confirmation prompt. The brief org name display is the only
safety check for the silent-org-switch case.

Error states: token not found / session revoked → render "This kitchen link is
no longer active. Contact your manager." Do NOT redirect — user lands nowhere
with no claim and would see empty data with no explanation.

**OrgContext** is NOT involved in the claim flow. It only handles
already-claimed sessions. Conditional RPC calls inside a context provider based
on URL params is a footgun — keep claim logic in its own page.

## RLS posture (PHASE 7.5 — PLANNED)

- Every domain table's anon policy reads
  `current_role_claim() = 'kitchen_anon' AND org_id = current_org_id()`. No more
  `using (true)`. RLS is the primary cross-tenant barrier; app-side
  `.eq('org_id', orgId)` stays as defense-in-depth.
- `briefing_tasks` anon UPDATE column-restricted to `is_completed` only via
  `revoke update on briefing_tasks from anon; grant update (is_completed) to anon;`
- `management_notes` alerts: soft-delete via new `is_cleared` + `cleared_at`
  columns. Kitchen UPDATE column-restricted to
  `is_cleared, cleared_at, content, pinned`. No anon DELETE policy at all.
  Existing rows backfill `is_cleared = false`.
- `kitchen_upcoming_events` view dropped — anon now reads `upcoming_banquets`
  directly via real RLS. The `notes` column becomes visible to kitchen
  (acceptable: kitchen sees events they're cooking; column-hide attempt in Phase
  7 was solving the wrong problem).

## EightySixFeed special case (PHASE 7.5 — PLANNED)

- Kitchen anon has SELECT/INSERT/UPDATE on `management_notes` where
  `category = 'alerts' AND org_id = current_org_id()`.
- Soft-delete only — UI sets `is_cleared = true, cleared_at = now()` instead of
  hard DELETE.
- SELECT filters `.is('is_cleared', false)` on the kitchen side. Office may
  later want a "cleared history" view; out of scope for 7.5.

## Office-side kitchen link management (PHASE 7.5 — PLANNED)

New page at `/o/:orgSlug/kitchen-links`. Per-row UI:

- Label (editable inline)
- Created (date + by whom)
- Last claimed (`last_claimed_at` or "Never")
- Status (Active / Revoked + revoked timestamp)
- `claim_count` (cumulative)
- `active_claims` (current device count)
- Actions: Copy link / Revoke

Generate flow: button → modal → label input → "Generate" → modal shows full
claim URL once with copy button + warning "This link won't be shown again. Copy
it now." → close, row appears with token hidden.

No edit-token-itself. Rotation = revoke + new.

Navigation: standalone route for Phase 7.5. Settings dropdown is a future
refactor — out of scope for an anon-hardening phase.

## Edge function: kitchen-link-mutations (PHASE 7.5 — PLANNED)

NEW file, NOT extending `admin-mutations`. Reasoning: `admin-mutations` gates on
`is_platform_admin === true` (single-role check). Kitchen link mutations gate on
"authenticated user is owner/manager of the same org as the session being
mutated" (two-check: role AND org-scope). Bolting a second auth pattern into
`admin-mutations` is a footgun.

Actions:

- `create_kitchen_session` — generates token server-side via Deno
  `crypto.getRandomValues` (32 bytes → base64url, ~43 chars). Returns plaintext
  to office UI ONCE. Stores hash. Client never sends a token.
- `revoke_kitchen_session` — sets `revoked_at = now()` on the session AND
  deletes matching `kitchen_claims` rows. Already-connected tablets keep working
  until JWT refresh (~1hr). New claim attempts with the revoked token fail
  because `revoked_at is not null`. Stateless-JWT cost; instant revoke would
  need Realtime channel, out of scope.
- `update_kitchen_session_label` — label only.

Auth gate: decode JWT, verify `app_metadata.org_id` matches the target session's
`org_id`, verify `role` is owner or manager. Same gate on every action in the
file. No mode-switching.

## Why this architecture (LIVE)

Retrofitting DailyBrief was too risky for Old Hawthorne's live data. Clean fork
= multi-tenancy from day one. Phase 7 closed the gap of unscoped queries; Phase
8 closed the gap of manual org provisioning. Phase 7.5 closes the last gap:
raw-anon-key access with `using (true)` policies meant anon cross-tenant
isolation was app-side only. Phase 7.5 makes RLS the real barrier for kitchen
anon, matching the standard already in place for authenticated users.

## Phase 7.5 prerequisites (manual, not in SQL)

Before applying the Phase 7.5 migration:

- **Anonymous Sign-Ins enabled** in Supabase Dashboard → Auth → Providers.
  Toggle is project-level config, does NOT carry over via migration. Currently
  enabled in this project as of 2026-04-26. Verify on any fresh environment with
  `await supabase.auth.signInAnonymously()` returning a session.
- **Captcha (Turnstile or hCaptcha)** — NOT required for Phase 7.5 verification,
  but required before first real customer org is provisioned. Anon sign-ins
  create real `auth.users` rows; without captcha a bot loop fills the auth
  table. Tracked as Phase 8+ followup.
