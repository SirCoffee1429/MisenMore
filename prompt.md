Starting a new session on MisenMore at `C:\MisenMore\Misenmore`.

Follow the session init protocol in `CLAUDE.md`: read `.claude/changes_made/CHANGES.md`, `CLAUDE.md`, and `IMPLEMENTATION_PLAN.md`, summarize the last 3 tasks, and output `Context loaded. Ready to continue from [LAST TASK TITLE].` before doing any work.

After init, these facts carry over from the prior session and aren't fully captured in the logs:

## Where we are

**Phase 4 closed and committed.** The Phase 4 commit/push was done manually by the user — working tree should be clean (or only contain whatever you start in this session). Full Phase 4 details are in CHANGES.md, including the JWT-decode bug fix that came up mid-build.

**Phase 5 is next** per the implementation plan: route structure restructuring.

## Critical gotcha — JWT claims vs. user.app_metadata

The `custom_access_token_hook` stamps `org_id`/`org_slug`/`role` into the **JWT payload's** `app_metadata`. It does NOT touch `auth.users.raw_app_meta_data`. Therefore:

- `session.user.app_metadata` will NOT have these fields. It mirrors the DB row.
- The JWT itself (`session.access_token`) carries them.
- Always read claims via `readOrgClaims(session)` exported from `app/src/lib/auth/AuthContext.jsx` — it decodes the JWT payload.

This bit us once already in Phase 4 (every sign-in surfaced "Account not provisioned" until fixed). Any new auth-touching code must use the helper, not `session.user.app_metadata`.

## Test scaffolding — keep in place, do NOT delete

Still needed for Phase 5+ verification. Tear-down scheduled for Phase 8 before real org provisioning.

- User: `test@misenmore.local`
- Password: `testing` (weak; dev-local only)
- User UUID: `f39be8bb-325d-4fb6-8bdd-5ef4339df3ae`
- Org slug: `test-org`
- Org UUID: `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`
- Org name: `Test Org`
- `org_members` row links user → org with role `owner`

## Phase 4 files (now the foundation for Phase 5)

- `app/src/lib/auth/AuthContext.jsx` — `<AuthProvider>`, exports `readOrgClaims` helper
- `app/src/lib/auth/useAuth.js`
- `app/src/lib/org/OrgContext.jsx` — `<OrgProvider>` reads `:orgSlug` via `useParams()`, queries `organizations`, exposes `{ orgId, orgSlug, orgName, loading, error }`. **Not yet exercised** — Phase 5 will be the first real use when kitchen routes wrap in it
- `app/src/lib/org/useOrg.js`
- `app/src/lib/org/withOrg.js` — throws on falsy orgId (refuses to write unscoped rows)
- `app/src/components/ProtectedRoute.jsx` — children-as-prop wrapper. Resolution order: loading → no session → no org claim → URL slug mismatch vs JWT slug → render
- `app/src/pages/Login.jsx` — uses `readOrgClaims` to read org_slug from the freshly-issued session

## Environment

- Supabase project ref: `unqflkmrdfmxtggrcglc`
- Vite dev server: stale instances often occupy 5173–5175 from prior sessions; Vite auto-bumps to 5176+. Don't assume 5173.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` live in `app/.env.local` (gitignored)
- Supabase MCP tools available for SQL, migrations, advisors, edge functions. Auth user creation and auth hook configuration remain dashboard-only.

## Open decisions / deferred items

- **`extension_in_public` WARN on `vector`** — deferred. Leave alone unless concrete operational need.
- **Multi-org tiebreaker in `custom_access_token_hook`** — `order by m.created_at asc limit 1` is non-deterministic on sub-microsecond collisions. Revisit when multi-org membership is real.
- **xlsx advisories** (Phase 1 followup) — evaluate replacement before any prod deploy.
- **Early anon SELECT policy on `organizations`** was pulled forward from Phase 7 (migration `20260417000000_anon_select_organizations_for_slug_lookup`). When Phase 7 lands, **do NOT re-add this policy** — it already exists. Phase 7's policy list needs adjustment so this table only gets the `auth read own org` policy added.

## Phase 5 scope (from IMPLEMENTATION_PLAN.md)

**Goal:** Replace the legacy DailyBrief route tree with slug-scoped routes. Both layouts read slug from context, never from hardcoded paths.

**Current state of `app/src/App.jsx`:**
- Wrapped in `<AuthProvider>` ✓
- `/login` route exists ✓
- `/o/:orgSlug` route exists but renders an inline `PhaseFourStub` — Phase 5 replaces this with the real `<OfficeLayout/>` + nested route tree
- Legacy `/kitchen/*` and `/office/*` routes still present — Phase 5 deletes all of them
- Inline `PhaseFourStub` component — delete during Phase 5

**Files that need to be removed or rebuilt during Phase 5:**
- `app/src/pages/RoleSelect.jsx` — replace with a real landing or just redirect `/` somewhere sensible
- `app/src/pages/Communication.jsx` — not in the planned route map; verify with user before deletion
- `/kitchen/sales` and `/kitchen/sales/:date` routes — kitchen NEVER sees sales per CLAUDE.md. Drop entirely.

**Files that need to be created:**
- `app/src/components/OrgResolver.jsx` — wraps kitchen routes, mounts `<OrgProvider>` from URL slug
- The Phase 5 route tree from IMPLEMENTATION_PLAN.md (lines 415–448)

**Layouts (`KitchenLayout.jsx`, `OfficeLayout.jsx`) need updates:**
- All nav links currently use hardcoded `/kitchen/*` and `/office/*` paths — must read slug from `useOrg()` (kitchen) or `useAuth()` (office) and build paths dynamically
- Both inherited from DailyBrief without modification — review carefully

## Verification target for Phase 5

- `/k/test-org` → loads kitchen dashboard anonymously, OrgContext resolves slug, all nav tabs route to `/k/test-org/...`
- `/k/nonexistent-slug` → 404 state from OrgContext error
- `/o/test-org` (signed in as test user) → loads office dashboard, all nav tabs route to `/o/test-org/...`
- All kitchen pages render without sales/financial data anywhere
- Refreshing on any route preserves correct context

## Before touching code

Don't jump into implementation. First:

1. Confirm the init summary against my expectations.
2. Run `git status` to verify the working tree is actually clean from Phase 4's commit.
3. Read `app/src/components/KitchenLayout.jsx` and `app/src/components/OfficeLayout.jsx` to see how DailyBrief's nav is wired today and what hardcoded paths need replacing.
4. Read `app/src/pages/Dashboard.jsx` and `app/src/pages/OfficeDashboard.jsx` briefly — they're rendered as the index routes and may have hardcoded internal links.
5. Confirm whether `Communication.jsx` should be deleted, kept and routed differently, or merged into something else.
6. Propose a concrete file-by-file Phase 5 sequence before writing anything. Flag any ambiguity against the plan for alignment.

Then we'll build it.
