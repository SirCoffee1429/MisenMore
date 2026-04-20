Starting a new session on MisenMore at `C:\MisenMore\Misenmore`.

Follow the session init protocol in `CLAUDE.md`: read `.claude/changes_made/CHANGES.md`, `CLAUDE.md`, and `IMPLEMENTATION_PLAN.md`, summarize the last 3 tasks, and output `Context loaded. Ready to continue from [LAST TASK TITLE].` before doing any work.

After init, these facts carry over from the prior session and aren't fully captured in the logs:

## Where we are

**Phase 7 closed.** Row-Level Security is live on all 11 domain tables. Authenticated users see only `org_id = current_org_id()` rows; anon (kitchen) gets the CLAUDE.md allowlist (SELECT on briefings/tasks/workbooks/sheets/categories/features, SELECT+UPDATE on briefing_tasks, CRUD on `management_notes` filtered to `category = 'alerts'`). `sales_data`, `banquet_event_orders`, `workbook_chunks`, and direct `upcoming_banquets` are implicitly denied to anon. Cross-tenant isolation was verified with a throwaway second test org (`test-org-b`), which has since been torn down.

**Phase 6 was committed at the start of this session** (`5e94a94 phase 5 completed` shown in git log is the Phase 5 commit; Phase 6's commit came before Phase 7 work began). Working tree now has the two Phase 7 migration files plus one `EventsBanquetsPage.jsx` edit, all to commit as the Phase 7 feat.

**Phase 8 is next:** admin tooling + first real org provisioning + Postmark per-org routing.

## What was built in Phase 7 (quick recap — CHANGES.md has the full list)

**New migrations:**
- `supabase/migrations/20260420000000_phase7_rls_policies.sql` — enables RLS on 11 tables, writes 44 authenticated policies and 12 anon policies, creates the `kitchen_upcoming_events` view with anon+authenticated SELECT grants
- `supabase/migrations/20260420000100_revert_kitchen_upcoming_events_hardening.sql` — documents and reverts a failed attempt to switch the view to `security_invoker` + column-revoke `notes` from anon (Supabase's default ACL overrode the column revoke)

**Modified:**
- `app/src/pages/EventsBanquetsPage.jsx` — `loadBanquets()` branches on `readOnly`: kitchen reads `kitchen_upcoming_events` view (no `notes`); office reads `upcoming_banquets` table directly (RLS enforces org isolation)

## Gotchas to carry into Phase 8

- **`security_definer_view` ERROR on `kitchen_upcoming_events`** in the advisor output. Intentional — see the revert migration's comment block for the full threat-model write-up. Don't "fix" it without also solving the column-level anon grant problem (see Phase 7 followups in CHANGES.md).
- **`rls_policy_always_true` WARN on `briefing_tasks` anon UPDATE** — intentional per CLAUDE.md rule 10. Anon cross-tenant isolation is app-side.
- **`rls_enabled_no_policy` on `org_members`** — deferred to Phase 8. Adding the policy is part of the admin panel work.
- **Postmark `TEST_ORG_ID` hardcode** in `process-sales-data` and `process-banquets` edge functions is STILL in place. This is the central Phase 8 blocker — do not provision a second real org before wiring per-org routing (per-address inbound or From-address → org_id table).
- **Supabase default ACL fights column-level revokes.** If you ever need to restrict anon to specific columns of a table, you must revoke the table-level SELECT first, then grant column-level SELECT — and test that the migration actually took effect by simulating `set local role anon; select <restricted_col> from <table>` via the MCP tool.
- **`current_org_id()` relies on `app_metadata.org_id` in the JWT**, stamped by the `custom_access_token_hook`. For testing RLS via MCP `execute_sql`, simulate claims with `set local "request.jwt.claims" = '{"app_metadata":{"org_id":"...","org_slug":"...","role":"..."},"sub":"..."}'` after `set local role authenticated` — `set local` is transaction-scoped so the claims and role reset at query end.
- **`set local role anon` in MCP has one caveat** — it does NOT enforce the session user's column-level grants if the session user is a superuser. Column-level isolation must be verified via the real anon key through the REST API, not via MCP SQL. (This is how the failed hardening migration was initially missed.)

## Test scaffolding

- **Test org:** `test-org` / id `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`
- **Test user:** `test@misenmore.local` / password `testing` / id `f39be8bb-325d-4fb6-8bdd-5ef4339df3ae` / role `owner`
- **`test-org-b` / deterministic uuid `11111111-1111-1111-1111-111111111111` was created mid-Phase 7 and torn down.** If you need to reseed for Phase 8 cross-tenant checks, use the same uuid pattern so the teardown SQL stays deterministic.
- **Seeded-row id convention:** `aaaa000N-0000-0000-0000-000000000001` for ORG_A rows, `bbbb000N` for ORG_B rows (N = table index). Makes the teardown delete-by-id trivial and the cross-tenant diff visible at a glance.

## Environment

- Supabase project ref: `unqflkmrdfmxtggrcglc` (epbtryuelqfowetkyoot org, accessible via MCP)
- Local path: `C:\MisenMore\Misenmore`
- Vite dev server lives in `app/`; `npm run build` from `app/` produces a clean 123-module bundle
- MCP tools used this phase: `apply_migration`, `execute_sql`, `get_advisors`. No dashboard work was required for Phase 7

## Open decisions (Phase 8)

- **Postmark multi-tenant routing design** — per-org inbound addresses (`sales+<slug>@inbound...`) or a From-address → org_id mapping table? CLAUDE.md doesn't pick; either works. Pick before touching `process-sales-data` / `process-banquets`
- **Admin panel scope** — just org/member CRUD, or include a usage dashboard? Plan says "lightweight"; stick to that
- **`org_members` policy wording** — `auth select own memberships` (`user_id = auth.uid()`) is the obvious first cut. Decide if platform admins need a separate override policy
- **First real org provisioning checklist** — sequence from `IMPLEMENTATION_PLAN.md` Phase 8 step list. Dry-run against `test-org` once before touching a real customer

## Pre-touch checklist for Phase 8

- [ ] `git status` → expect clean tree if Phase 7 was committed; confirm before starting
- [ ] `git log --oneline -5` → confirm Phase 6 and Phase 7 commits landed
- [ ] Run `get_advisors(security)` once, confirm the known list hasn't grown
- [ ] Re-read the Phase 7 CHANGES.md entry for the `kitchen_upcoming_events` view context — don't accidentally fix the `security_definer_view` advisor without also solving the anon column grant
- [ ] Decide Postmark routing design before any edge function edits
- [ ] Before the first real org is inserted into `public.organizations`, the Postmark `TEST_ORG_ID` hardcode MUST be gone from both edge functions (`process-sales-data`, `process-banquets`). Otherwise the new org's sales emails silently land in `test-org`
