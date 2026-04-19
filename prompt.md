Starting a new session on MisenMore at `C:\MisenMore\Misenmore`.

Follow the session init protocol in `CLAUDE.md`: read `.claude/changes_made/CHANGES.md`, `CLAUDE.md`, and `IMPLEMENTATION_PLAN.md`, summarize the last 3 tasks, and output `Context loaded. Ready to continue from [LAST TASK TITLE].` before doing any work.

After init, these facts carry over from the prior session and aren't fully captured in the logs:

## Where we are

**Phase 5 closed and committed.** Full Phase 5 details are in CHANGES.md. Working tree should be clean.

**Phase 6 is next** per the implementation plan: rebuild all Supabase queries to be org-scoped.

## What was built in Phase 5

**New files:**
- `app/src/components/OrgResolver.jsx` — mounts `<OrgProvider>`, inner `OrgGate` reads `useOrg()` and handles loading/404/error before rendering `<KitchenLayout />`. This is the wrapper element for all `/k/:orgSlug/*` routes.
- `app/src/pages/ManagementBoardPage.jsx` — renamed from `Communication.jsx`. Wraps `ManagementWhiteboard` with "Management Board" header.

**Updated files:**
- `app/src/components/KitchenLayout.jsx` — uses `<Outlet />` (not `{children}`), reads `useOrg()` for slug, all nav links are `/k/${orgSlug}/...`. Sales tab removed. Briefings tab added. "Tasks" renamed "Chat" with `fa-comments` icon.
- `app/src/components/OfficeLayout.jsx` — uses `<Outlet />` (not `{children}`), reads `useAuth()` for slug, all nav links are `/o/${orgSlug}/...`. DailyBrief `sessionStorage` logout replaced with `signOut()` from AuthContext. "Communication" nav item → "Board" at `/o/${orgSlug}/board`.
- `app/src/App.jsx` — full nested route tree. Legacy `/kitchen/*` and `/office/*` routes gone. `PhaseFourStub` gone. Kitchen: `/k/:orgSlug/*` under `<OrgResolver><KitchenLayout /></OrgResolver>`. Office: `/o/:orgSlug/*` under `<ProtectedRoute><OfficeLayout /></ProtectedRoute>`. All sub-pages are nested `<Route>` children rendered via `<Outlet />`.

**Deleted:**
- `app/src/pages/Communication.jsx`

## Critical gotcha — JWT claims vs. user.app_metadata

The `custom_access_token_hook` stamps `org_id`/`org_slug`/`role` into the **JWT payload's** `app_metadata`. It does NOT touch `auth.users.raw_app_meta_data`. Therefore:

- `session.user.app_metadata` will NOT have these fields.
- Always read claims via `readOrgClaims(session)` exported from `app/src/lib/auth/AuthContext.jsx`.

This bit us in Phase 4 (every sign-in returned "Account not provisioned" until fixed). Any new auth-touching code must use the helper.

## Test scaffolding — keep in place, do NOT delete

Still needed through Phase 6 verification. Tear-down scheduled for Phase 8.

- User: `test@misenmore.local`
- Password: `testing` (dev-local only)
- User UUID: `f39be8bb-325d-4fb6-8bdd-5ef4339df3ae`
- Org slug: `test-org`
- Org UUID: `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`
- Org name: `Test Org`
- `org_members` row links user → org with role `owner`

## Environment

- Supabase project ref: `unqflkmrdfmxtggrcglc`
- Vite dev server: stale instances often occupy 5173–5175 from prior sessions; Vite auto-bumps to 5176+. Don't assume 5173.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` live in `app/.env.local` (gitignored)
- Supabase MCP tools available for SQL, migrations, advisors, edge functions. Auth user creation and auth hook configuration remain dashboard-only.

## Open decisions / deferred items

- **`extension_in_public` WARN on `vector`** — deferred. Leave alone.
- **Multi-org tiebreaker in `custom_access_token_hook`** — revisit when multi-org membership is real.
- **xlsx advisories** (Phase 1 followup) — evaluate replacement before any prod deploy.
- **Early anon SELECT policy on `organizations`** was pulled forward from Phase 7 (migration `20260417000000_anon_select_organizations_for_slug_lookup`). When Phase 7 lands, **do NOT re-add this policy** — it already exists. Phase 7 only needs to add the `auth read own org` policy for that table.
- **`RoleSelect.jsx` at `/`** — still the landing page placeholder. A real landing page redesign is post-Phase 5 scope.

## Phase 6 scope (from IMPLEMENTATION_PLAN.md)

**Goal:** Every Supabase query in every component passes `org_id`. Every write uses `withOrg()`. Every edge function stamps `org_id`.

### Frontend query rules
- **Anon (kitchen):** always `.eq('org_id', orgId)` where `orgId` comes from `useOrg()`
- **Authenticated (office):** RLS enforces org_id server-side (Phase 7); still pass `orgId` on all INSERTs via `withOrg()`
- **Guards:** never issue a query if `orgId` is null — return loading state

### Files to update (27 call sites)

| File | Change needed |
|---|---|
| `lib/useCategories.js` | Add `.eq('org_id', orgId)` param |
| `Dashboard.jsx` | Pass orgId to all queries |
| `OfficeDashboard.jsx` | Pass orgId to all queries |
| `Briefings.jsx` | Add org filter; wrap writes with withOrg |
| `BriefingEditor.jsx` | Add org filter; wrap writes with withOrg |
| `History.jsx` | Add org filter |
| `KitchenRecipes.jsx` | Add org filter |
| `WorkbookLibrary.jsx` | Add org filter; wrap writes |
| `WorkbookUpload.jsx` | Wrap all inserts with withOrg |
| `WorkbookViewer.jsx` | Add org filter |
| `RecipeCreator.jsx` | Wrap all inserts with withOrg |
| `SalesReports.jsx` | Add org filter (office only) |
| `SalesReportDetail.jsx` | Add org filter (office only) |
| `SalesTrendChart.jsx` | Add org filter (office only) |
| `EightySixFeed.jsx` | Add org filter; wrap writes |
| `EventsBanquetsPage.jsx` | Add org filter; wrap writes |
| `ManagementWhiteboard.jsx` | Add org filter; wrap writes |
| `WeeklyFeatures.jsx` | Add org filter; wrap writes |
| `kitchen-assistant` fn | Add p_org_id to match_chunks call |
| `embed-chunks` fn | Accept org_id in payload, stamp on chunks |
| `process-sales-data` fn | Accept/stamp org_id |
| `process-beo` fn | Accept/stamp org_id |
| `process-banquets` fn | Accept/stamp org_id |

### Key reminder — SalesBriefing
`SalesBriefing` queries `sales_data`. It must be **office dashboard only**. Remove it from any kitchen route. Kitchen never sees sales or revenue data.

## Before touching code

1. Confirm the init summary against my expectations.
2. Run `git status` to verify the working tree is clean.
3. Read the first 3-5 files from the Phase 6 table above to understand current query patterns before proposing changes.
4. Propose a concrete file-by-file Phase 6 sequence (frontend first, then edge functions). Flag any ambiguity for alignment.

Then we'll build it.
