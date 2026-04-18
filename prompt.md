# Session resume prompt — paste this verbatim into a fresh Claude Code session

---

Starting a new session on MisenMore at `C:\MisenMore\Misenmore`.

Follow the session init protocol in `CLAUDE.md`: read `.claude/changes_made/CHANGES.md`, `CLAUDE.md`, and `IMPLEMENTATION_PLAN.md`, summarize the last 3 tasks, and output `Context loaded. Ready to continue from [LAST TASK TITLE].` before doing any work.

After init, these facts carry over from the prior session and aren't fully captured in the logs:

## Where we are

**Phase 3 closed on 2026-04-17.** Full details in CHANGES.md. The `custom_access_token_hook` is live and dashboard-wired — verified end-to-end with a real password sign-in; the issued JWT carries `app_metadata.org_id`, `app_metadata.org_slug`, and `app_metadata.role`. The mutable-search-path advisor WARNs from Phase 2 are cleared.

**Phase 4 is next** per the implementation plan: React auth/org layer.

## Test scaffolding — keep in place, do NOT delete

Kept specifically so Phase 4 sign-in verification has a target:

- User: `test@misenmore.local`
- Password: `testing` (weak; dev-local only)
- User UUID: `f39be8bb-325d-4fb6-8bdd-5ef4339df3ae`
- Org slug: `test-org`
- Org UUID: `cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e`
- Org name: `Test Org`
- `org_members` row links user → org with role `owner`

Signing in as this user produces a JWT with claims pointing at `test-org`. Tear-down happens at Phase 8 before real org provisioning.

## Environment

- Supabase project ref: `unqflkmrdfmxtggrcglc`
- Vite dev server: port 5173 (`cd app && npm run dev`)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` live in `app/.env.local` (gitignored). Safe to read when you need them for curl-based JWT tests.
- Supabase MCP tools are available for SQL, migrations, advisors, edge functions, etc. Auth user creation and auth hook configuration are NOT exposed through MCP — those remain dashboard-only.

## Open decisions carried forward

- `extension_in_public` WARN on `vector` — deferred by explicit decision. Leave the extension in `public` schema unless a concrete operational need surfaces.
- Multi-org tiebreaker in `custom_access_token_hook` — current rule is `order by m.created_at asc limit 1`. Non-deterministic on sub-microsecond collisions. Flagged in the function body comment; revisit when multi-org membership is a real feature.

## Working-tree state (as of session close)

Uncommitted work spans Phases 2 and 3:
- `.claude/changes_made/CHANGES.md` (M) — Phase 2 and Phase 3 entries
- `IMPLEMENTATION_PLAN.md` (M) — Phase 2 and Phase 3 checkboxes flipped
- `supabase/migrations/` (untracked) — four Phase 2 migrations + two Phase 3 migrations

Ask before committing; don't push on your own.

## Phase 4 scope (from IMPLEMENTATION_PLAN.md)

Files to create:

- `app/src/lib/auth/AuthContext.jsx`
- `app/src/lib/auth/useAuth.js`
- `app/src/lib/org/OrgContext.jsx`
- `app/src/lib/org/useOrg.js`
- `app/src/lib/org/withOrg.js`
- `app/src/pages/Login.jsx`
- `app/src/components/ProtectedRoute.jsx`

`AuthContext` reads JWT `app_metadata` (stamped by the hook we just built) and exposes `{ session, user, orgId, orgSlug, role, loading, signIn, signOut }`. `OrgContext` resolves `:orgSlug` → org row for anonymous kitchen routes. `withOrg(orgId, row)` stamps `org_id` onto every write payload. `ProtectedRoute` redirects unauthenticated visits to `/login` and mismatched slugs to the JWT's `org_slug`.

Verification target for Phase 4: sign in as `test@misenmore.local` at `/login`, get redirected to `/o/test-org`, hit a protected route successfully, then sign out and confirm redirect back to `/login`.

## Before touching code

Don't jump into implementation. First:

1. Confirm the init summary against my expectations.
2. Read `app/src/lib/supabase.js` and `app/src/App.jsx` to understand the current client and route tree (DailyBrief heritage — may have residual auth assumptions or commented-out OfficeGate imports to clean up).
3. Propose a concrete file-by-file implementation sequence for Phase 4 before writing anything.
4. Flag any ambiguity against the plan for alignment before starting.

Then we'll build it.
