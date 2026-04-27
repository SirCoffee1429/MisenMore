# Phase 7.5 — Anon Kitchen JWT Hardening: Design Spec

**Date:** 2026-04-27
**Status:** Approved — proceed to writing-plans

The full architecture is locked in `memory/project_auth_decisions.md`. This document
records the ambiguity resolutions agreed in the Phase 7.5 kick-off session.

---

## Locked design reference

See `memory/project_auth_decisions.md` for:
- `kitchen_sessions` and `kitchen_claims` table schemas
- `claim_kitchen_session()` RPC spec
- `current_role_claim()` helper
- Token hook rewrite (branch on `is_anonymous`)
- 12 anon policy rewrites
- `EightySixFeed` soft-delete spec (`is_cleared` / `cleared_at`)
- Column-restrict UPDATE on `briefing_tasks` and `management_notes`
- `kitchen-link-mutations` edge function action list and auth gate
- `/o/:orgSlug/kitchen-links` page spec
- `/k/:orgSlug/claim/:token` page spec (`KitchenClaim.jsx`)

---

## Ambiguity resolutions (session-agreed additions to the locked spec)

### 1. Unclaimed device wall — `KitchenUnclaimed.jsx`

When a device visits `/k/:orgSlug` with no anonymous session, or a session whose
JWT carries no `role: 'kitchen_anon'` claim, OrgGate renders `KitchenUnclaimed`
instead of the kitchen dashboard. Kitchen never renders half-baked.

`KitchenUnclaimed.jsx` is its own file (not inline in OrgGate). It is also the
destination for `KitchenClaim` error states (revoked token, unknown token) — those
states render the same "This device is not linked. Scan the kitchen QR code or ask
your manager for the setup link." message. No redirect from error states; the user
lands on `KitchenUnclaimed` with no automatic recovery.

**Trigger conditions in OrgGate:**
- No Supabase session at all.
- Session exists but `session.user.is_anonymous !== true` AND `role !== 'kitchen_anon'`
  (i.e., neither an authenticated office user nor a claimed kitchen device — shouldn't
  happen in practice but guarded).
- Session is anonymous but JWT has no `role` claim yet (claim flow not completed).

### 2. `signInAnonymously()` confined to `KitchenClaim.jsx`

OrgGate never calls `signInAnonymously()`. Calling it on every `/k/:orgSlug` visit
would silently mint anon users for bots, stale links, and curious visitors. The
claim flow is the only authorized entry point for creating a new anon session.

### 3. `readOrgClaims` guard for `kitchen_anon`

In `AuthContext.jsx`, `readOrgClaims(session)` adds an early return:

```js
if (meta.role === 'kitchen_anon') {
  return { orgId: null, orgSlug: null, role: null, isPlatformAdmin: false }
}
```

This makes a kitchen anon session look like "no session" to all office-side
consumers. Office code never sees kitchen JWT claims.

### 4. `ProtectedRoute` blocks anonymous Supabase sessions

`ProtectedRoute` adds a check on `session.user?.is_anonymous`. This is the
Supabase Auth canonical flag (set by the platform, not derived from the hook),
so it is the primary signal. `role !== 'kitchen_anon'` from decoded claims is
acceptable as a secondary signal but `is_anonymous` is authoritative.

A kitchen device that navigates to an office URL gets redirected to `/login` the
same as an unauthenticated visitor.

### 5. Migration ordering — policy-add before view-drop

Within `20260427000000_phase7_5_anon_jwt_hardening.sql`, the anon SELECT policy
on `upcoming_banquets` must appear before the `DROP VIEW kitchen_upcoming_events`
statement. This prevents any window where kitchen anon has zero access to upcoming
banquet data, and ensures the ordering is safe if the migration is ever replayed
statement-by-statement.

### 6. Sign-out / cross-device session collision (known quirk, no code fix)

If a developer signs in to the office on the same browser they used to test a
kitchen claim, `supabase.auth.signOut()` on the office side wipes the anonymous
kitchen session from localStorage. The kitchen device must re-claim.

In production this cannot happen: kitchen tablets and office devices are separate
physical hardware. This is documented as a dev-environment quirk only. No code
change required.

---

## Execution sequence (single commit)

1. **SQL migration** — `supabase/migrations/20260427000000_phase7_5_anon_jwt_hardening.sql`
   - New tables: `kitchen_sessions`, `kitchen_claims`
   - New columns on `management_notes`: `is_cleared bool not null default false`, `cleared_at timestamptz`; backfill existing rows
   - New SQL helpers: `current_role_claim()`, `claim_kitchen_session()` RPC
   - Token hook rewrite (branch on `is_anonymous`)
   - 12 anon policy rewrites: `using (true)` → `current_role_claim() = 'kitchen_anon' AND org_id = current_org_id()`
   - Anon SELECT policy on `upcoming_banquets`
   - Column-restrict UPDATE on `briefing_tasks` (only `is_completed`) and `management_notes` (only `is_cleared, cleared_at, content, pinned`)
   - Drop `kitchen_upcoming_events` view (after policy-add above)

2. **Edge function** — `supabase/functions/kitchen-link-mutations/index.ts`

3. **New React pages** — `KitchenClaim.jsx`, `KitchenLinks.jsx`, `KitchenUnclaimed.jsx`

4. **React updates**:
   - `AuthContext.jsx` — `readOrgClaims` kitchen_anon guard
   - `ProtectedRoute.jsx` — `is_anonymous` check
   - `OrgContext.jsx` — stale comment updates
   - `OrgResolver.jsx` / OrgGate — `KitchenUnclaimed` rendering for unclaimed sessions
   - `EightySixFeed.jsx` — soft-delete, `is_cleared` filter
   - `EventsBanquetsPage.jsx` — both paths read `upcoming_banquets` directly
   - `App.jsx` — add `claim/:token` kitchen route and `kitchen-links` office route

5. **Verification** — reseed `test-org-b` (uuid `11111111-1111-1111-1111-111111111111`), run 7 cross-tenant attack tests from `project_auth_decisions.md`, tear down

6. **Close-out** — CHANGES.md entry, prompt.md rewrite, single commit
