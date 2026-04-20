Starting a new session on MisenMore at `C:\MisenMore\Misenmore`.

Follow the session init protocol in `CLAUDE.md`: read `.claude/changes_made/CHANGES.md`, `CLAUDE.md`, and `IMPLEMENTATION_PLAN.md`, summarize the last 3 tasks, and output `Context loaded. Ready to continue from [LAST TASK TITLE].` before doing any work.

After init, these facts carry over from the prior session and aren't fully captured in the logs:

## Where we are

**Phase 6 closed.** Every Supabase query in `app/src/` is org-scoped; every write wraps `withOrg()`; every edge function stamps or requires `org_id`. Full Phase 6 details are in CHANGES.md.

**Working tree is dirty — Phase 6 is NOT committed yet.** 30 modified files + 1 new file (`app/src/lib/useCurrentOrg.js`). The previous session ended before commit. First move in the new session should be: run `git status` to confirm, review the diff, then commit Phase 6 as a single feat commit before starting Phase 7.

**Phase 7 is next** per the implementation plan: turn on RLS for every domain table.

## What was built in Phase 6 (quick recap — CHANGES.md has the full list)

**New file:**
- `app/src/lib/useCurrentOrg.js` — resolves `{ orgId, orgSlug, loading, error, source }` for pages mounted in both route trees (Briefings, EventsBanquetsPage, RecipeCreator, AiChat, WorkbookViewer). Reads `OrgContext` first (kitchen anon), falls back to `AuthContext` (office JWT). `source` is `'org'` or `'auth'` — pages use it to pick link bases and write-path gating.

**Contract for the rest of the app:**
- Kitchen pages use `useOrg()` directly.
- Office pages use `useAuth()` directly.
- Dual-context pages use `useCurrentOrg()`.
- Shared components (`EightySixFeed`, `WeeklyFeatures`, `ManagementWhiteboard`, `SalesBriefing`, `SalesTrendChart`, `CategoryManager`, `EditRecipeContentModal`) all accept `orgId` as a prop from whichever parent resolved it. No shared component reads context directly.
- `useCategories(orgId)` — now takes orgId as a required param. Short-circuits to empty list when nullish instead of issuing an unscoped query.

**Route tree addition:**
- `app/src/App.jsx` — added `<Route path="recipes/:id" element={<WorkbookViewer readOnly />}>` under `/k/:orgSlug`. KitchenRecipes was linking into a non-existent target in Phase 5; this closes the gap so kitchen crew can view recipe detail without the edit-category UI.

**Kitchen Dashboard cleanup:**
- `Dashboard.jsx` no longer imports or renders `<SalesBriefing />` (CLAUDE.md kitchen-data boundary).
- "Edit Notes" link (which pointed at the office briefing editor) replaced with "View Briefings" link into `/k/${orgSlug}/briefings`.

**Office Dashboard cleanup:**
- Deleted dead `handleLogout` function (DailyBrief sessionStorage — Phase 5 already moved sign-out to the layout via `signOut()` from AuthContext).
- Rewrote the "Full View" button for the communication panel to point at `/o/${orgSlug}/board` (the real `ManagementBoardPage` route). The DailyBrief `/office/chat` target never existed in the MisenMore route tree.

**Edge functions:**
- `kitchen-assistant` — accepts `org_id` in request body. Scopes `sales_data` reads, passes `p_org_id` to `match_chunks` RPC, scopes keyword-fallback `workbook_chunks` read. Returns 400 if org_id missing.
- `embed-chunks` — accepts `org_id` in payload. Pending-chunk fetch AND per-chunk update both filter by `workbook_id` AND `org_id`. This is the only safety net — service role bypasses RLS.
- `process-beo` — now requires `org_id` in payload (JSON or multipart). Returns 400 if missing. Only invoked from the office dashboard, never from Postmark.
- `process-sales-data` and `process-banquets` — Postmark option (c) applied. Both stamp rows with `TEST_ORG_ID` (env var with fallback to `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`). Flagged `TODO(Phase 8)` for per-org Postmark routing. The sales dedupe delete now also scopes by `org_id` so a resent email can't clobber another tenant once multi-org is real.

## Critical gotcha — JWT claims vs. user.app_metadata

(Unchanged from Phase 4 — still load-bearing.)

The `custom_access_token_hook` stamps `org_id`/`org_slug`/`role` into the **JWT payload's** `app_metadata`. It does NOT touch `auth.users.raw_app_meta_data`. Therefore:

- `session.user.app_metadata` will NOT have these fields.
- Always read claims via `readOrgClaims(session)` exported from `app/src/lib/auth/AuthContext.jsx`.

## New Phase 6 gotchas worth remembering

1. **Dual-context pages always early-return on `!orgId`.** The resolver returns `loading=true` briefly (OrgContext runs an async slug lookup; AuthContext waits on first getSession()). If you skip the guard and fire a Supabase query with `orgId === null`, you'll get either an unscoped read (before Phase 7 RLS) or a blocked read (after). Every page was written with `if (!orgId) return` / `useEffect` early-return. Keep that pattern.

2. **`withOrg()` throws when `orgId` is falsy.** This is intentional — refuses to produce an unscoped row. Means: only call `withOrg` inside an `if (!orgId) return` guarded branch, never at the top of a component render.

3. **Kitchen anon has zero RLS policy on `banquet_event_orders`.** `Dashboard.jsx` currently counts upcoming events from that table — works today (no RLS enabled yet), but will silently become `count=0` after Phase 7. Listed as a followup below; pick the fix before Phase 7 shipping.

4. **`RecipeCreator` is reachable from kitchen** via `/k/:orgSlug/recipes/create`, but anon has no `INSERT` policy on `workbooks`. Today it appears to work; Phase 7 will break the write path. Listed below.

5. **`process-sales-data` and `process-banquets` use a hardcoded `TEST_ORG_ID`.** This is option (c) — deliberate temporary hack. Any production data in these tables between now and Phase 8 will all belong to the test org.

## Test scaffolding — keep in place, do NOT delete

Still needed through Phase 7 verification. Tear-down scheduled for Phase 8.

- User: `test@misenmore.local`
- Password: `testing` (dev-local only)
- User UUID: `f39be8bb-325d-4fb6-8bdd-5ef4339df3ae`
- Org slug: `test-org`
- Org UUID: `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`
- Org name: `Test Org`
- `org_members` row links user → org with role `owner`
- `TEST_ORG_ID` in Postmark edge functions falls back to this same UUID.

## Environment

- Supabase project ref: `unqflkmrdfmxtggrcglc`
- Vite dev server: stale instances often occupy 5173–5175 from prior sessions; Vite auto-bumps to 5176+. Don't assume 5173.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` live in `app/.env.local` (gitignored).
- Supabase MCP tools available for SQL, migrations, advisors, edge functions. Auth user creation and auth hook configuration remain dashboard-only.
- Phase 6 did NOT run a live dev-server check. Build verification (`vite build --mode development`) passed clean twice; runtime verification against the test org on `/k/test-org` and `/o/test-org` is still TODO — see checklist below.

## Open decisions / deferred items

Unchanged carryover:
- **`extension_in_public` WARN on `vector`** — deferred. Leave alone.
- **Multi-org tiebreaker in `custom_access_token_hook`** — revisit when multi-org membership is real.
- **xlsx advisories** (Phase 1 followup) — evaluate replacement before any prod deploy.
- **Early anon SELECT policy on `organizations`** was pulled forward from Phase 7 (migration `20260417000000_anon_select_organizations_for_slug_lookup`). **Do NOT re-add this policy in Phase 7** — it already exists. Phase 7 only needs to add the "auth read own org" policy for that table.
- **`RoleSelect.jsx` at `/`** — still a placeholder. Currently has raw `/kitchen` and `/office` links that point nowhere real. Landing-page redesign is post-Phase-5 scope.

New in Phase 6:
- **Postmark multi-tenancy (Phase 8 blocker)** — `TEST_ORG_ID` in `process-sales-data` and `process-banquets`. Must be replaced with a From-address → org_id lookup (dedicated mapping table or per-org inbound addresses) before the first real org is provisioned.
- **Kitchen Dashboard events count** — `Dashboard.jsx` lines ~56-60 count `banquet_event_orders`. Kitchen has zero access to that table. Today it returns a count unchecked by RLS, but Phase 7 will silence it. Options: (a) switch the count to `upcoming_banquets` which kitchen CAN see; (b) remove the tile from kitchen. Recommendation: (a), since the tile is useful and the semantic is closer to "upcoming events visible to the crew" anyway.
- **Kitchen RecipeCreator** — `/k/:orgSlug/recipes/create` is reachable with a "Create Recipe" button in KitchenRecipes, but anon has no INSERT on `workbooks`. Either remove the button on kitchen or add a kitchen-write policy. Decision needed before Phase 7.
- **Supabase Storage paths are not org-prefixed** — `WorkbookUpload` writes `${timestamp}_${filename}` directly to the `workbooks` bucket. Row-level `org_id` on `workbooks` is currently enough for the public-URL pattern, but Storage RLS (future phase) will need either per-org folders or a storage policy keyed on the row.
- **`banquet_event_orders.completed` column** — referenced by `EventsBanquetsPage` toggle. Not confirmed present in the Phase 2 migration. If advisor flags it during Phase 7, add it in the same migration.
- **Phase 6 is uncommitted** — see top. Commit before any Phase 7 work so the Phase 7 diff stays clean.

## Phase 7 scope (from IMPLEMENTATION_PLAN.md)

**Goal:** Turn on RLS for every domain table. Define the policies that implement the CLAUDE.md RLS summary table.

### Policy targets (from CLAUDE.md)

| Table | Authenticated | Anon (kitchen) |
|---|---|---|
| organizations | read own org | SELECT (slug lookup — ALREADY EXISTS, don't re-add) |
| org_members | read own | none |
| briefings | full CRUD own org | SELECT |
| briefing_tasks | full CRUD own org | SELECT + UPDATE (completion) |
| workbooks | full CRUD own org | SELECT |
| workbook_sheets | full CRUD own org | SELECT |
| workbook_chunks | full CRUD own org | none |
| recipe_categories | full CRUD own org | SELECT |
| sales_data | full CRUD own org | **none** |
| management_notes | full CRUD own org | alerts category only (SELECT/INSERT/DELETE/UPDATE) |
| upcoming_banquets | full CRUD own org | SELECT via kitchen_upcoming_events view |
| banquet_event_orders | full CRUD own org | **none** |
| weekly_features | full CRUD own org | SELECT |

### Key rules for the migration

- Authenticated policies use `current_org_id()` helper (already exists, search_path hardened in Phase 3).
- Anon policies must check `org_id` explicitly — they have no JWT claim to match against. Anon SELECT policies should be permissive across all orgs (the `.eq('org_id', orgId)` in the frontend is the actual per-org filter).
- For `briefing_tasks` anon UPDATE: restrict columns to `is_completed` only via a policy USING / WITH CHECK clause.
- For `management_notes` anon CRUD on alerts: `USING (category = 'alerts') WITH CHECK (category = 'alerts')`.
- `kitchen_upcoming_events` view needs `security_invoker=on` so anon reads respect the table's (new) RLS policy.

### Pre-Phase-7 housekeeping

Resolve the three "kitchen reachable but no RLS policy" cases from the Open Decisions list BEFORE writing the RLS migration:
1. Kitchen Dashboard events count → `upcoming_banquets`.
2. Kitchen RecipeCreator "Create" button → remove or add anon INSERT policy on `workbooks` + `workbook_sheets` + `workbook_chunks`.
3. `RoleSelect` page → at minimum, point the two cards at `/login` and (e.g.) `/k/` search, or replace entirely. Low priority but it's the landing page.

## Before touching code

1. Confirm the init summary against my expectations.
2. `git status` — verify Phase 6 is still uncommitted. Review the diff for anything stale.
3. Commit Phase 6 as a single `feat:` commit using the detailed CHANGES.md entry as the body.
4. Decide the three housekeeping questions above (kitchen events count, kitchen RecipeCreator, RoleSelect).
5. Draft the Phase 7 RLS migration file by file, by policy. Flag any ambiguity (e.g. exact WITH CHECK expression for anon `briefing_tasks` column-level update) for alignment before applying.
6. After migration applies: re-run the app against the test org, `/k/test-org` and `/o/test-org`, to confirm no regression in the happy path.

Then we'll build it.
