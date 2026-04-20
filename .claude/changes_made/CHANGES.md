# MisenMore — Change Log

---

### 2026-04-20 — Phase 7: RLS Policies

**Type:** `feat`
**Summary:** Turned on Row-Level Security on all 11 domain tables and
locked down every policy. Phase 6 moved every app-side query to be
org-scoped; Phase 7 enforces that at the database layer. Authenticated
users get full CRUD only on rows matching `current_org_id()`. Anon
(kitchen) gets the CLAUDE.md-defined read subset plus the two explicit
write exceptions (`briefing_tasks` UPDATE, `management_notes` CRUD
filtered to `category = 'alerts'`). `sales_data`,
`banquet_event_orders`, `workbook_chunks`, and `upcoming_banquets` have
no anon policies — implicit deny. Cross-tenant isolation verified via
scripted SQL with a throwaway second test org (`test-org-b`) that was
torn down at phase end.

**New files:**
- `supabase/migrations/20260420000000_phase7_rls_policies.sql` — single
  migration containing: `enable row level security` on 11 tables, 44
  authenticated policies (4 per table, all gated on
  `org_id = public.current_org_id()`), 12 anon policies per the
  allowlist, `kitchen_upcoming_events` view + grants to anon and
  authenticated
- `supabase/migrations/20260420000100_revert_kitchen_upcoming_events_hardening.sql`
  — documents and reverts a failed defense-in-depth attempt (see
  "Followups" below). Leaves the view owner-rights, consistent with the
  original plan

**Updated files:**
- `app/src/pages/EventsBanquetsPage.jsx` — `loadBanquets()` now branches
  on `readOnly`: kitchen (anon) reads from `kitchen_upcoming_events`
  view (projects safe columns only, omitting `notes`); office
  (authenticated) continues to read `upcoming_banquets` directly so RLS
  enforces org isolation at the table level. Both paths retain the
  `.eq('org_id', orgId)` filter

**Verification:**
- `mcp.apply_migration` on `20260420000000_phase7_rls_policies` returned
  success; `pg_tables.rowsecurity` confirms RLS on for all 11 tables;
  `pg_policies` query confirms correct policy counts per table
  (banquet_event_orders=4, briefings=5, briefing_tasks=6,
  management_notes=8, etc.)
- Seeded one row per target table for both `test-org` and `test-org-b`,
  with distinct labels like `ORG_A wedding` / `ORG_B banquet`, so a
  cross-tenant leak would be visible in query output
- **Anon scripted verification** — 13 checks, all pass:
  - Allowed SELECTs return expected row counts on `briefings`,
    `briefing_tasks`, `management_notes` (alerts only), `workbooks`,
    `workbook_sheets`, `recipe_categories`, `weekly_features`,
    `kitchen_upcoming_events`
  - Denied SELECTs return 0 rows on `sales_data`,
    `banquet_event_orders`, `workbook_chunks`, direct
    `upcoming_banquets`, `management_notes` where `category = 'comms'`
  - Anon INSERT into `management_notes` with `category = 'comms'`
    rejected with `42501` (WITH CHECK)
  - Anon UPDATE of a non-alerts row matches 0 rows (USING filter)
  - Anon UPDATE that tries to flip an alert row into comms rejected
    with `42501` (WITH CHECK)
- **Authenticated user A (org `test-org`)** — 9 checks, all pass:
  `current_org_id()` returns the correct UUID; all table SELECTs
  return only ORG_A-labeled rows; `organizations` returns only
  `test-org`
- **Authenticated user B (org `test-org-b`)** — 9 checks, all pass:
  symmetric to user A; only ORG_B rows visible; cannot see
  `test-org` in `organizations`
- **Cross-tenant write boundary tests** (user A targeting ORG_B rows):
  - UPDATE of ORG_B briefing id → 0 rows affected (USING filter)
  - DELETE of ORG_B briefing id → 0 rows affected (USING filter)
  - INSERT with `org_id = ORG_B_uuid` → rejected with `42501`
    (WITH CHECK)
  - Post-attack read (as user B): ORG_B briefing title is untouched
- **Build** — `vite build` 123 modules, zero errors
- `get_advisors` post-migration: remaining items are expected, see
  Followups

**Teardown:**
- `test-org-b`, both test-labeled row sets (ids starting `aaaa0`/`bbbb0`)
  deleted. Only `test-org` + its one user remain, as before Phase 7

**Followups (not Phase 7 scope):**
- **`security_definer_view` ERROR on `kitchen_upcoming_events`** — the
  Supabase advisor flags the view as high-severity because it isn't
  `security_invoker = true`. We attempted a hardening migration to set
  invoker semantics + revoke column-level SELECT on `notes` from anon.
  Both pieces were undermined by Supabase's default ACL on the `public`
  schema (default_privileges owned by `supabase_admin` grants anon a
  full-table SELECT that overrides column-level revokes per Postgres
  privilege hierarchy — empirically verified: anon could still read
  `notes` post-revoke). The revert migration restored the owner-rights
  model. Per CLAUDE.md rule 10, kitchen anon cross-tenant isolation is
  app-side (`.eq('org_id', orgId)`) by design — the same contract as
  briefings / workbooks / weekly_features. Authenticated cross-tenant
  isolation is enforced on `upcoming_banquets` directly and the office
  code path does not hit the view. Consider revisiting in Phase 8 with
  a proper column-grant-based approach that fights the default ACL, or
  with per-org inbound Postmark addresses that obviate the notes-hiding
  requirement entirely
- **`rls_policy_always_true` WARN on `briefing_tasks` anon UPDATE** —
  intentional. Anon has UPDATE access so kitchen crew can toggle task
  completion. Per CLAUDE.md the only write-paths anon has are this one
  and the `management_notes` alerts CRUD; both rely on app-side org
  scoping. The advisor warning is a known-good
- **`rls_enabled_no_policy` INFO on `org_members`** — deferred to Phase
  8 with the admin panel (per our Q2 decision this session). Adding a
  policy now would be writing code with no consumer
- **`auth_leaked_password_protection` WARN** — unrelated Supabase Auth
  setting. Worth enabling during Phase 8 pre-launch hardening
- **`extension_in_public` WARN on `vector`** — unchanged from Phase 2
- **Postmark `TEST_ORG_ID` hardcode** — still Phase 8 blocker per the
  Phase 6 entry. No change this phase

**Next:** Phase 8 — Admin tooling + first real org provisioning. Move
Postmark edge functions off `TEST_ORG_ID` to real per-org routing.
Provision the first commercial org. Add an admin panel for org
management and an `org_members` policy pair to support it.

---

### 2026-04-19 — Phase 6: Org-Scoped Queries

**Type:** `feat`
**Summary:** Rewrote every Supabase query in the app to be org-scoped.
Kitchen (anon) queries explicitly `.eq('org_id', orgId)` from the
URL-slug-resolved `OrgContext`. Office (authenticated) writes pass
through `withOrg()` from JWT-stamped `orgId` in `AuthContext`. Edge
functions now accept `org_id` in their payload (or fall back to the
test org for Postmark inbound webhooks, per the agreed Option C). The
kitchen `SalesBriefing` card was removed (CLAUDE.md kitchen-data
boundary). Legacy `/kitchen/*` and `/office/*` inline link references
left over from DailyBrief were rewritten to the slug-scoped `/k/:orgSlug/*`
and `/o/:orgSlug/*` paths. Phase 5 only rewrote layouts + the route tree;
Phase 6 covers the pages themselves.

**New files:**
- `app/src/lib/useCurrentOrg.js` — resolves the active org for pages
  mounted in both trees (Briefings, EventsBanquetsPage, RecipeCreator,
  AiChat, WorkbookViewer). Reads `OrgContext` first (kitchen anon
  slug resolution), falls back to `AuthContext` (office JWT claims).
  Returns `{ orgId, orgSlug, loading, error, source }` where `source`
  is `'org'` or `'auth'` so pages can branch link destinations and
  write-path eligibility without knowing which shell is hosting them.

**Updated — frontend hooks/helpers:**
- `app/src/lib/useCategories.js` — accepts `orgId` param. Short-circuits
  to empty list when orgId is nullish. Every query now
  `.eq('org_id', orgId)` — no unscoped reads.

**Updated — shared components (all accept `orgId` prop):**
- `app/src/components/EightySixFeed.jsx` — reads/writes `management_notes`
  (alerts). All ops scoped by `org_id`; inserts wrap via `withOrg()`.
- `app/src/components/WeeklyFeatures.jsx` — reads/writes `weekly_features`.
  All ops scoped; inserts `withOrg()`.
- `app/src/components/ManagementWhiteboard.jsx` — reads/writes
  `management_notes`. All ops scoped; inserts `withOrg()`.
- `app/src/components/SalesBriefing.jsx` — office-only. Hardcoded link
  now builds `/o/${orgSlug}/sales` from the prop. Reads
  `sales_data` scoped by `org_id`. Removed `useLocation` branching that
  referenced legacy `/office` vs `/kitchen` dashboard paths.
- `app/src/components/SalesTrendChart.jsx` — accepts `orgId` and scopes
  every `sales_data` fetch.
- `app/src/components/CategoryManager.jsx` — accepts `orgId`, wraps
  category inserts with `withOrg()`, scopes category + cascaded
  workbook updates by `org_id`.
- `app/src/components/EditRecipeContentModal.jsx` — accepts `orgId`,
  scopes `workbook_sheets` reads and updates.

**Updated — pages (all queries org-scoped; all writes via `withOrg()`;
  legacy `/office/*` and `/kitchen/*` Links rewritten to slug-scoped
  paths built from `orgSlug`):**
- `app/src/pages/Dashboard.jsx` — kitchen dashboard. Removed
  `<SalesBriefing />` (CLAUDE.md: kitchen never sees sales). Removed
  the now-obsolete "Edit Notes" Link (pointed at the office editor),
  replaced with a "View Briefings" link into the kitchen briefings
  route. All other links build from `orgSlug` via `useOrg()`. Pass
  `orgId` to `<EightySixFeed>`. Every query `.eq('org_id', orgId)`.
- `app/src/pages/OfficeDashboard.jsx` — deleted dead `handleLogout`
  (DailyBrief sessionStorage; Phase 5 already moved sign-out to the
  layout via `signOut()` from `AuthContext`). Rewrote all links to
  `/o/${orgSlug}/...`. "Full View" button for the communication panel
  now points at the real `/o/${orgSlug}/board` route (DailyBrief's
  `/office/chat` target never existed in the MisenMore route tree).
  Passes `orgId` to `<WeeklyFeatures>`, `<ManagementWhiteboard>`,
  `<SalesTrendChart>`. Counts queries all scoped.
- `app/src/pages/Briefings.jsx` — dual-context via `useCurrentOrg()`.
  Office sees new/edit/delete buttons; kitchen is read-only. Link base
  resolves to `/k/${orgSlug}/briefings` or `/o/${orgSlug}/briefings`
  based on `source`. Writes org-scoped; task toggle allowed for both
  shells (kitchen anon has UPDATE on `briefing_tasks` per CLAUDE.md RLS
  table).
- `app/src/pages/BriefingEditor.jsx` — office-only. `useAuth()` for
  orgId/orgSlug. Every insert wraps `withOrg()`. Every
  update/delete filters by `org_id`.
- `app/src/pages/History.jsx` — office-only. `useAuth()` for orgId.
  Briefing lookup scoped by `org_id`.
- `app/src/pages/KitchenRecipes.jsx` — kitchen-only. `useOrg()`. All
  workbook reads scoped. Card links now point at `/k/${orgSlug}/recipes/${wb.id}`
  (see new WorkbookViewer route below). Passes `orgId` to
  `EditRecipeContentModal`.
- `app/src/pages/WorkbookLibrary.jsx` — office. `useAuth()` for orgId/
  orgSlug. All reads/writes scoped. Links rewritten. `<CategoryManager>`
  gets `orgId` prop.
- `app/src/pages/WorkbookUpload.jsx` — office. `useAuth()` for orgId.
  Duplicate check, workbook insert, sheet/chunk inserts, update-category
  all scoped. `embed-chunks` invocation now passes `org_id` so the
  downstream function can stamp and scope.
- `app/src/pages/WorkbookViewer.jsx` — dual-context. `useCurrentOrg()`
  resolves orgId + backlink base. Supports a new `readOnly` prop so
  kitchen shows the recipe but hides the category selector. Workbook
  and sheet fetches scoped by `org_id`. Back link built from `orgSlug`.
- `app/src/pages/RecipeCreator.jsx` — dual-context. `useCurrentOrg()`.
  Inserts for `workbooks`, `workbook_sheets`, `workbook_chunks` all via
  `withOrg()`. `embed-chunks` invocation passes `org_id`. Backlink
  resolves by `source`.
- `app/src/pages/SalesReports.jsx` — office. `useAuth()` for orgId/
  orgSlug. Dropped the legacy `/kitchen/sales` branch (kitchen never
  sees sales per CLAUDE.md — the branch was dead code). Rewrote back
  button and date links to `/o/${orgSlug}/...`. `sales_data` read
  scoped.
- `app/src/pages/SalesReportDetail.jsx` — same treatment: office-only,
  scoped reads, rewritten links.
- `app/src/pages/EventsBanquetsPage.jsx` — dual-context via
  `useCurrentOrg()`. Kitchen variant (readOnly) skips the
  `banquet_event_orders` query entirely (anon has zero RLS policy on
  that table per CLAUDE.md — explicit guard avoids a guaranteed
  forbidden response). Office variant: every write via `withOrg()`,
  every delete/update filters by `org_id`. Back link resolves by
  `readOnly`. `process-beo` invocation now passes `org_id`.
- `app/src/pages/AiChat.jsx` — `useCurrentOrg()`. Passes `org_id` to
  the `kitchen-assistant` edge function so RAG retrieval
  (`match_chunks`) stays scoped per org.
- `app/src/pages/ManagementBoardPage.jsx` — office-only. `useAuth()`
  for orgId; forwards it to `<ManagementWhiteboard>`.

**Updated — App router:**
- `app/src/App.jsx` — added `<Route path="recipes/:id" element={<WorkbookViewer readOnly />}>`
  under `/k/:orgSlug`. KitchenRecipes linked to a non-existent target
  in Phase 5; this adds the matching read-only recipe detail view for
  kitchen crew.

**Updated — edge functions (every domain-table write now stamps
`org_id`; every read that could return rows across tenants is
explicitly scoped):**
- `supabase/functions/kitchen-assistant/index.ts` — accepts `org_id`
  in request body. Sales path scopes `sales_data` by `org_id`. RAG
  path passes `p_org_id` to the `match_chunks` RPC. Keyword-fallback
  fetch scopes `workbook_chunks` by `org_id`.
- `supabase/functions/embed-chunks/index.ts` — accepts `org_id`.
  Pending-chunk fetch filters by `workbook_id` AND `org_id` (service
  role bypasses RLS, so this is the only safety net against a
  cross-tenant `workbook_id` slipping in). Per-chunk update also
  scoped.
- `supabase/functions/process-sales-data/index.ts` — Postmark inbound
  webhook. Option C applied: stamp every row with `TEST_ORG_ID` (env
  var with a fallback to the test org UUID) until per-org Postmark
  routing is introduced in Phase 8. Deduplication delete now also
  scoped by `org_id` so a resent email can't clobber another tenant's
  rows in the future multi-tenant state.
- `supabase/functions/process-banquets/index.ts` — same Option C
  treatment; `upcoming_banquets` rows stamped with `TEST_ORG_ID`.
- `supabase/functions/process-beo/index.ts` — now accepts `org_id`
  from the dashboard upload payload (JSON or multipart) and stamps
  every `banquet_event_orders` insert. Returns 400 if missing — no
  implicit fallback since this function is only invoked from the
  authenticated dashboard, never from Postmark.

**Verification:**
- `vite build --mode development` — 123 modules, zero errors, clean
  compile. Ran twice (once mid-work, once at end); both clean.
- Every page that reads org-scoped data now early-returns until
  `orgId` resolves, so refresh on `/k/:orgSlug/*` shows a "loading"
  state rather than firing an unscoped query against a half-populated
  context.
- Spot-check grep: every `supabase.from(...)` in `app/src/` is
  followed by either an `eq('org_id', ...)`, a `withOrg(...)` wrapped
  insert, or is a write whose filter chain includes `.eq('org_id', ...)`.

**Followups (not Phase 6 scope):**
- **Postmark multi-tenant routing** — `TEST_ORG_ID` in
  `process-sales-data` and `process-banquets` is a deliberate
  temporary hack per the agreed Option C. Phase 8 must introduce
  per-org inbound addresses or a From-address → org_id mapping
  table before the first real org is provisioned.
- **Supabase Storage keys are not org-prefixed.** `WorkbookUpload`
  still writes `${timestamp}_${filename}` to the `workbooks` bucket.
  Storage RLS is a Phase 7+ concern; the row-level `org_id` on
  `workbooks` is sufficient for the current access-via-public-URL
  pattern.
- **`banquet_event_orders.completed` column** — referenced by
  `EventsBanquetsPage` but never confirmed in the Phase 2 migration.
  If advisor flags it, Phase 7 RLS migration is the right place to
  add it.

**Next:** Phase 7 — RLS policies on every domain table. Authenticated
users get full CRUD only for rows matching `current_org_id()`; anon
gets the CLAUDE.md-defined read subset plus the two explicit write
exceptions (`briefing_tasks` UPDATE, `management_notes` alerts CRUD).

---

### 2026-04-18 — Phase 5: Route Structure

**Type:** `feat`
**Summary:** Replaced the legacy DailyBrief flat route tree with slug-scoped
nested routes. Both layouts now read org slug from context and build all nav
links dynamically. Legacy `/kitchen/*` and `/office/*` routes deleted.

**Details:**
- `app/src/components/OrgResolver.jsx` — new component. Mounts `<OrgProvider>`
  and gates kitchen routes via an inner `OrgGate` component that reads
  `useOrg()` and renders loading/404/error states before passing through to
  `<KitchenLayout />`. Keeps guard logic out of the layout itself
- `app/src/pages/ManagementBoardPage.jsx` — renamed from `Communication.jsx`.
  Wraps `ManagementWhiteboard`, updated header to "Management Board" with
  chalkboard icon. `Communication.jsx` deleted
- `app/src/components/KitchenLayout.jsx` — switched `{children}` to
  `<Outlet />` for nested route rendering. Imports `useOrg()` and builds all
  nav links as `/k/${orgSlug}/...`. Sales tab removed (kitchen never sees
  sales per CLAUDE.md). Briefings tab added in its place. "Tasks" tab
  renamed "Chat" and icon updated to `fa-comments` to match the AiChat route
  it points to
- `app/src/components/OfficeLayout.jsx` — switched `{children}` to
  `<Outlet />`. Imports `useAuth()` and builds all nav links as
  `/o/${orgSlug}/...`. DailyBrief `handleLogout` (sessionStorage + navigate)
  replaced with `signOut()` from AuthContext. "Communication" nav item
  renamed "Board" pointing to `/o/${orgSlug}/board`. `useNavigate` import
  removed
- `app/src/App.jsx` — full route tree rewrite. Legacy `/kitchen/*` and
  `/office/*` flat routes deleted. `PhaseFourStub` component deleted.
  Kitchen routes nested under `/k/:orgSlug` with `<OrgResolver><KitchenLayout /></OrgResolver>`
  as parent element. Office routes nested under `/o/:orgSlug` with
  `<ProtectedRoute><OfficeLayout /></ProtectedRoute>` as parent element.
  All sub-routes are children using `<Outlet />` injection

**Verification:**
- `vite build --mode development` — 122 modules, zero errors, clean compile
- `/k/test-org` → kitchen dashboard loads anonymously, nav links use
  `/k/test-org/...`
- `/k/nonexistent-slug` → "Organization not found" error state from OrgGate
- `/o/test-org` (signed in) → office dashboard, nav links use
  `/o/test-org/...`, Sign Out calls `signOut()` from AuthContext
- Refresh on any route preserves correct context

**Next:** Phase 6 — Rebuild all queries to be org-scoped. Every Supabase
query passes `org_id`. Every write uses `withOrg()`. Every edge function
stamps `org_id`.

---

### 2026-04-17 — Phase 4: React Auth/Org Contexts + Login + ProtectedRoute

**Type:** `feat`
**Summary:** Phase 4 wired the React-side auth/org plumbing on top of the
Phase 3 JWT hook. Seven new files plus a one-line anon SELECT policy on
`organizations` (pulled forward from Phase 7 so OrgContext can resolve
slugs for kitchen anon traffic). `App.jsx` got the minimum edits needed
to verify the sign-in flow — wrapped in `<AuthProvider>`, added `/login`,
added a stub `/o/:orgSlug` gated by `<ProtectedRoute>`. The legacy
DailyBrief `/kitchen/*` and `/office/*` routes are intentionally left in
place; Phase 5 rips them out and replaces them with the slug-scoped
route tree.

**Details:**
- Migration `20260417000000_anon_select_organizations_for_slug_lookup` —
  single policy `"anon read orgs for slug lookup"` on
  `public.organizations` (`for select to anon using (true)`). Pulled
  forward from Phase 7. Without this, OrgContext's slug lookup returns
  zero rows for anon and kitchen routes can't resolve their org.
  `organizations` holds nothing sensitive (id, slug, name, settings)
  and the slug is already in the URL
- `app/src/lib/auth/AuthContext.jsx` — `<AuthProvider>` wraps
  `supabase.auth.onAuthStateChange`, exposes
  `{ session, user, orgId, orgSlug, role, loading, signIn, signOut }`.
  Initial `loading=true` until first `getSession()` resolves so
  ProtectedRoute does not flash a `/login` redirect on refresh.
  Critical fix mid-build: claims are read by **decoding the JWT
  payload** (`session.access_token`), NOT from `session.user.app_metadata`.
  The custom_access_token_hook stamps the JWT only; `session.user.app_metadata`
  mirrors the `auth.users.raw_app_meta_data` DB column which the hook
  never touches. First implementation read the wrong field and surfaced
  as "Account not provisioned" on every sign-in. `readOrgClaims(session)`
  is exported so Login.jsx can use the same decoder
- `app/src/lib/auth/useAuth.js` — `useContext` hook, throws outside provider
- `app/src/lib/org/OrgContext.jsx` — `<OrgProvider>` reads `:orgSlug`
  from `useParams()`, queries `organizations` by slug via `maybeSingle()`,
  exposes `{ orgId, orgSlug, orgName, loading, error }`. Error states:
  `'missing_slug'`, `'not_found'`, or the raw Supabase error message.
  Cancellable via mounted-flag pattern to avoid setState-after-unmount
  on rapid slug changes
- `app/src/lib/org/useOrg.js` — same throws-outside-provider pattern
- `app/src/lib/org/withOrg.js` — stamps `org_id` onto write payloads
  (object or array). Throws if `orgId` is falsy — refuses to write an
  unscoped row rather than producing a silently-broken multi-tenant insert.
  Per CLAUDE.md rule 11: every INSERT/UPDATE wraps with this
- `app/src/components/ProtectedRoute.jsx` — children-as-prop wrapper.
  Resolution order: `loading` → no session → no org claim → URL slug
  mismatch vs JWT slug → render. Slug-mismatch redirects to JWT slug
  via `<Navigate replace>` so a manager can never see another org's
  shell even briefly. "Account not provisioned" is the no-org-claim
  fallback — covers the Phase 3 graceful no-op path
- `app/src/pages/Login.jsx` — email/password form. Uses `signIn` from
  AuthContext, decodes the returned session via the shared
  `readOrgClaims` helper, navigates to `/o/${slug}` on success.
  `useEffect` redirects already-signed-in visitors away from `/login`
  (covers refresh-while-authenticated). Error states: invalid creds
  (Supabase message passthrough), unprovisioned account (signed in
  but JWT carries no org_slug)
- `app/src/App.jsx` — wrapped `<Routes>` in `<AuthProvider>`, added
  `/login` route, added `/o/:orgSlug` route gated by `<ProtectedRoute>`
  rendering an inline `PhaseFourStub` (email/slug/role + Sign out
  button). All legacy `/kitchen/*` and `/office/*` routes preserved
  unchanged — Phase 5 territory

**Verification:**
- Vite dev booted clean on port 5176 (5173–5175 occupied by stale
  background dev servers from prior sessions, irrelevant)
- `/login` → enter `test@misenmore.local` / `testing` → redirected to
  `/o/test-org` → stub renders `User: test@misenmore.local`,
  `Org slug: test-org`, `Role: owner`. Confirms JWT decode reads the
  hook-stamped claims correctly
- Sign out from stub → bounced to `/login` (auth state change clears
  session, ProtectedRoute re-renders with no session)
- Visit `/o/test-org` while signed out → redirected to `/login`
- Sign in, visit `/o/wrong-slug` → redirected to `/o/test-org`
  (slug-mismatch guard fires)
- Refresh on `/o/test-org` while signed in → brief "Loading…" blip,
  then stub re-renders. URL never leaves `/o/test-org`. Confirms the
  loading-gate prevents a false `/login` flash on `getSession()` rehydrate

**Followups (not Phase 4 scope):**
- Phase 5 will rip out `RoleSelect`, the legacy `/kitchen/*` and
  `/office/*` route trees, and `Communication.jsx` (not in the planned
  route map). The `PhaseFourStub` inline component in `App.jsx` gets
  replaced by the real OfficeLayout + OfficeDashboard tree at the same
  time
- OrgProvider is written but unmounted in Phase 4 — first real exercise
  is Phase 5 when kitchen routes wrap in `<OrgProvider>` via OrgResolver
- The early anon SELECT policy on `organizations` needs to stay in
  Phase 7's policy list — note already in the migration comment

**Next:** Phase 5 — Route restructuring. Replace the DailyBrief route
tree with `/k/:orgSlug/*` (anon, OrgProvider-scoped) and `/o/:orgSlug/*`
(auth-gated, ProtectedRoute-scoped). Layouts and nav links read slug
from context, not hardcoded paths.

---

### 2026-04-17 — Phase 3: Supabase Auth + JWT Custom Claim Hook

**Type:** `feat`
**Summary:** Phase 3 wired JWT stamping end-to-end. Two migrations applied:
first hardened `search_path` on the Phase 2 helpers (`current_org_id`,
`match_chunks`) to silence the Supabase advisor before Phase 7 RLS policies
start calling them on every authenticated query. Second created the
`custom_access_token_hook` that stamps `org_id`, `org_slug`, and `role` into
JWT `app_metadata` on every sign-in/refresh. Verified against a real
password sign-in — the issued JWT now carries all three claims.

**Details:**
- Migration `20260416030000_harden_function_search_paths` — `alter function
  public.current_org_id() set search_path = ''` (tightest; body only touches
  `pg_catalog`, which is implicit); `alter function
  public.match_chunks(vector, int, uuid) set search_path = public` (needs
  `public` for the pgvector `<=>` operator). Pure metadata change, no body
  rewrites
- Migration `20260416030100_custom_access_token_hook` — `security definer`
  plpgsql function matching the IMPLEMENTATION_PLAN spec verbatim. Resolves
  oldest `org_members` row per user (multi-org switching is a future
  concern), stamps `{app_metadata,org_id|org_slug|role}`, returns the
  modified event. `revoke execute … from public, anon, authenticated` runs
  before `grant to supabase_auth_admin` to close the implicit PUBLIC grant
  window that `create or replace function` opens by default
- Dashboard hook toggle enabled manually: Authentication → Hooks → Custom
  Access Token → `public.custom_access_token_hook`. No MCP/CLI path for this
  step — strictly dashboard
- Test scaffolding kept for Phase 4 sign-in target: user `test@misenmore.local`
  (uuid `f39be8bb-325d-4fb6-8bdd-5ef4339df3ae`), org `test-org` (uuid
  `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`), `org_members` row with role
  `owner`. Tear down before first real org provisioning in Phase 8

**Verification:**
- `pg_proc` query confirms `search_path` now set on all three functions:
  `current_org_id=""`, `match_chunks=public`, `custom_access_token_hook=public`
  with `prosecdef=true` on the hook only
- Grants on the hook function: `postgres` (owner), `service_role` (inherited),
  `supabase_auth_admin` (explicit). `public`/`anon`/`authenticated` NOT in
  the grantee list — revoke closed the implicit PUBLIC grant
- Direct function invocation, provisioned-user path: claims stamped
  correctly with all three org fields in the returned event
- Direct function invocation, missing-membership path (uuid
  `00000000-...`): event passed through unchanged, `app_metadata` remains
  `{}`, no error — graceful no-op confirmed for Phase 4 ProtectedRoute
  "Account not provisioned" state
- End-to-end real sign-in: `POST /auth/v1/token?grant_type=password` for
  `test@misenmore.local` returned an access token whose decoded payload
  contains `app_metadata.org_id=cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`,
  `app_metadata.org_slug=test-org`, `app_metadata.role=owner` alongside
  GoTrue's default `provider`/`providers` fields
- Advisor re-run: both `function_search_path_mutable` WARNs from Phase 2
  are cleared. No new warnings introduced by the hook. Remaining advisor
  items are all expected Phase 7 work (domain-table RLS) plus the deferred
  `extension_in_public` WARN on `vector`

**Followups (not Phase 3 scope):**
- Multi-org tiebreaker — `order by m.created_at asc limit 1` is
  non-deterministic on sub-microsecond timestamp collisions. Irrelevant
  until multi-org membership lands; flagged in the function body comment
- Test user/org teardown before Phase 8 real-org provisioning
- `extension_in_public` WARN on `vector` still present; per Phase 3
  pre-work discussion we're leaving it until concrete operational pain

**Next:** Phase 4 — React `AuthContext` + `OrgContext` + `withOrg` helper,
`Login.jsx`, and `ProtectedRoute.jsx`. Login page calls
`supabase.auth.signInWithPassword` and redirects to `/o/:orgSlug` read
from JWT claims.

---

### 2026-04-16 — Phase 2: Database Schema

**Type:** `feat`
**Summary:** Applied all 4 Phase 2 migrations to MisenMore Supabase project
`unqflkmrdfmxtggrcglc`. Clean-room multi-tenant schema: 13 tables, all domain
tables stamped with `org_id uuid not null references organizations(id) on
delete cascade`. Extensions (`pgcrypto`, `vector 0.8.0`), helper functions
(`current_org_id()`, `match_chunks()`), and IVFFlat vector index in place.
RLS enabled only on `organizations` and `org_members`; domain-table RLS
intentionally deferred to Phase 7 per plan.

**Details:**
- Migration `20260416022100_extensions_and_organizations` — enabled pgcrypto
  + pgvector, created `organizations` and `org_members` with RLS on (policies
  deferred to Phase 7). Indexes on `org_members.user_id` and `.org_id`
- Migration `20260416022344_domain_tables` — created 11 domain tables:
  `workbooks`, `workbook_sheets`, `workbook_chunks` (with `vector(768)`
  embedding column), `recipe_categories`, `briefings`, `briefing_tasks`,
  `sales_data`, `management_notes`, `upcoming_banquets`,
  `banquet_event_orders`, `weekly_features`. Every table has `org_id uuid
  not null references organizations(id) on delete cascade`. All check
  constraints and unique constraints from plan applied verbatim
- Migration `20260416023743_indexes` — 11 secondary indexes, all
  org_id-leading to match query patterns
- Migration `20260416025001_postgres_helpers` — `current_org_id()` reads
  `app_metadata.org_id` from JWT claims; `match_chunks(query_embedding,
  match_count, p_org_id)` returns top-N cosine-similar chunks scoped to
  a single org; IVFFlat cosine index on `workbook_chunks.embedding` with
  `lists = 100`
- Local migration files saved under `supabase/migrations/` with matching
  Supabase version timestamps so `supabase db pull` / `migration list`
  stay aligned with the remote

**Verification:**
- `list_tables(public)` returns all 13 tables, rows=0 for each
- `list_migrations` returns all 4 migration records in order
- `select public.current_org_id()` → null (expected; no JWT in SQL editor)
- `select count(*) from pg_proc where proname = 'match_chunks'` → 1
- `select extversion from pg_extension where extname = 'vector'` → 0.8.0
- IVFFlat index on workbook_chunks confirmed via `pg_indexes`
- Security advisors reviewed: RLS-off errors on domain tables are
  intentional (Phase 7 turns them on); INFO-level "RLS enabled no policy"
  on `organizations` + `org_members` expected (policies Phase 7)

**Followups (not Phase 2 scope):**
- WARN: `public.current_org_id` and `public.match_chunks` have mutable
  `search_path`. Hardening fix: `alter function ... set search_path = ''`.
  Worth addressing before Phase 7 RLS goes live
- WARN: `vector` extension is installed in `public` schema. Supabase
  recommends a dedicated `extensions` schema, but moving it would cascade
  through every `vector(768)` column — defer unless/until operational pain

**Next:** Phase 3 — Supabase Auth + `custom_access_token_hook` to stamp
`org_id`, `org_slug`, and `role` into JWT `app_metadata` on every token.

---

### 2026-04-15 — Phase 1: Project Foundation

**Type:** `feat`
**Summary:** Bootable local dev environment. DailyBrief's React app and
Supabase edge functions copied into MisenMore, rebranded, scrubbed of
DailyBrief's prod credentials, wired to MisenMore Supabase project
`unqflkmrdfmxtggrcglc` via `app/.env.local`. Vite dev server boots clean
on port 5173.

**Details:**
- Copied `app/` from `C:\Old Hawthorne Projects\DailyBrief\app\` excluding
  `node_modules/`, `dist/`, `sample-data/`, `out.json`, `read_beo.mjs`
  (44 files, 435 KB)
- Copied `supabase/functions/` (all 7 edge functions) and `supabase/config.toml`.
  Migrations NOT copied — Phase 2 authors clean-room schema
- `app/package.json`: name `dailybrief` → `misenmore`, added MisenMore description
- `app/src/lib/supabase.js`: removed hardcoded DailyBrief URL + anon key
  fallbacks, now throws if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`
  is missing — prevents silent cross-project contamination
- Created `app/.env.local` (gitignored) with MisenMore Supabase URL + anon key
- Created `app/.env.example` (committed template)
- Copied `.gitignore` from DailyBrief — covers `.env.*`, `node_modules/`,
  `dist/`, `.vercel/`, `supabase/.temp/`, `secrets.txt`
- Deleted `app/src/components/OfficeGate.jsx` and removed its import +
  14 wrappers from `App.jsx`. Office routes are temporarily ungated;
  Phase 4 reintroduces real auth via `ProtectedRoute`
- Rebranded visible DailyBrief references: `index.html` title/meta,
  `RoleSelect.jsx` h1, `index.css` and `mobile.css` comment headers
- `npm install` succeeded (100 packages); `npm audit fix` patched
  picomatch + vite advisories. `xlsx` retains 2 known high-severity
  advisories (prototype pollution, ReDoS) with no upstream fix —
  inherited from DailyBrief, tracked as Phase 1 followup
- `supabase/config.toml` had no `project_id` field, only edge function
  config — no change needed. Project binding will happen at Phase 6
  deploy time via `--project-ref unqflkmrdfmxtggrcglc` or `supabase link`

**Verification:**
- Vite dev server booted on port 5173 in 287 ms, no terminal errors
- `index.html`, `main.jsx`, `App.jsx`, `lib/supabase.js` all serve `200`
  and compile via Vite's HMR transform
- Fail-fast confirmed: with `.env.local` removed, the served
  `lib/supabase.js` shows `import.meta.env` containing only
  `BASE_URL/DEV/MODE/PROD/SSR` — the throw fires at module load
- Grep for `dailybrief`, `DailyBrief`, `chajwmoohmiugdgvqjyo` across
  `app/` and `supabase/`: zero matches
- `git check-ignore` confirms `app/.env.local` and `app/node_modules/`
  are excluded from tracking

**Followups (not Phase 1 scope):**
- xlsx high-severity advisories — evaluate replacement (e.g. `exceljs`)
  before any prod deploy
- Phase 2 will author clean-room SQL migrations against the empty
  MisenMore database

**Next:** Phase 2 — Database schema (organizations, org_members, all
domain tables with `org_id` from day one).

---

### 2026-04-14 — Project Initialized

**Type:** `init`
**Summary:** MisenMore created as a multi-tenant commercial product forked from
DailyBrief (Old Hawthorne Country Club's standalone app). DailyBrief remains
untouched as a permanently single-org app.

**Details:**
- New GitHub repo: https://github.com/SirCoffee1429/MisenMore
- New Supabase project: unqflkmrdfmxtggrcglc (same Supabase org as DailyBrief, accessible via MCP)
- CLAUDE.md written with full project context, architecture, and behavior rules
- IMPLEMENTATION_PLAN.md written with 8-phase build plan
- Phase 0 complete: architecture finalized, all decisions made
- Next: Phase 1 — Project Foundation (copy DailyBrief code, connect to new Supabase)

---
