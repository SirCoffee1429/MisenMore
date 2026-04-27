# MisenMore — Claude Code Brief

Multi-tenant kitchen and restaurant management platform. Two user types per org:
kitchen crew (anonymous) and office (email/password). Commercial multi-tenant
successor to DailyBrief; separate repo, Supabase, deployment. DailyBrief is
never touched by MisenMore work.

## Stack & Identity

- React 19 + Vite, React Router v7, Supabase, Vercel
- Gemini 3 Flash (chat/categorize/sales), `gemini-embedding-001` (RAG)
- Postmark inbound (per-org plus-addressing), Google Weather API
- Supabase project: `unqflkmrdfmxtggrcglc`
- Repo: `https://github.com/SirCoffee1429/MisenMore`
- Local: `C:\MisenMore\Misenmore`

## Three Access Modes

| Mode     | Path          | Auth               | Who              |
| -------- | ------------- | ------------------ | ---------------- |
| Kitchen  | `/k/:orgSlug` | None (anonymous)   | Kitchen crew     |
| Office   | `/o/:orgSlug` | Email/password     | Managers, owners |
| Platform | `/admin`      | Auth + admin claim | Platform admin   |

Kitchen reaches their org via bookmarked URL or QR. No login during service.

## Roles & Claims

- `org_members.role`: `owner` | `manager` | `kitchen_staff`
- `is_platform_admin`: separate boolean JWT claim, sourced from
  `platform_admins` table. NOT a role value. Stamped true/false on every
  authenticated JWT, never null. Anon users do not receive this claim.
- JWT `app_metadata` carries `org_id`, `org_slug`, `role`, `is_platform_admin`,
  stamped by `custom_access_token_hook` on every token issuance.

## Multi-Tenant Isolation

- Every domain table has `org_id uuid NOT NULL references organizations(id)`.
- RLS enabled on all 11 domain tables.
- **Authenticated:** RLS gates everything on `org_id = current_org_id()`, which
  reads from JWT.
- **Anonymous kitchen:** RLS policies are currently `using (true)` — isolation
  is **app-side** via mandatory `.eq('org_id', orgId)` on every query. Known
  gap. Phase 7.5 (next commit) replaces with JWT-stamped `kitchen_anon` role
  claim and
  `current_role_claim() = 'kitchen_anon' AND
  org_id = current_org_id()`
  policies.

## Kitchen Data Boundary (CRITICAL)

Kitchen NEVER sees sales, revenue, or financials. Anon role has zero RLS policy
on `sales_data`, `banquet_event_orders`, `workbook_chunks` — implicit deny.
Kitchen CAN see: briefings, tasks, recipes, weekly features, 86'd alerts
(`management_notes` where `category='alerts'`), upcoming event names/dates,
weather. `SalesBriefing` is office-dashboard-only; never put it on a kitchen
route.

## Postmark Inbound Routing

Single Postmark stream resolves to org via plus-addressing.
`organizations.inbound_email_key` (32-char random, unique). Office forwards to
`sales+<key>@parse.misenmore.com`. `process-sales-data` and `process-banquets`
extract key from `MailboxHash` (regex on To header as fallback), call
`org_id_for_inbound_key(p_key)`. Missing key → 400; unknown key → 404. No silent
landing in default org. `process-beo` accepts `org_id` in payload
(dashboard-only), unaffected.

## Org Provisioning

Via `/admin` panel only (Phase 8, shipped 2026-04-26). The `create_org` action
in `admin-mutations` edge function generates the `inbound_email_key` and inserts
the row. Manual SQL provisioning is no longer the path. Self-serve sign-up is a
future phase.

## Edge Functions (current)

`kitchen-assistant` (RAG, scoped by `org_id`), `categorize-recipe`,
`embed-chunks`, `get-weather`, `process-sales-data` (Postmark + key routing),
`process-banquets` (Postmark + key routing), `process-beo` (dashboard upload,
`org_id` in payload), `admin-mutations` (platform-admin gated: `create_org`,
`list_members`, `invite_member`, `remove_member`, `rotate_inbound_key`).

All functions writing to domain tables stamp `org_id`. `match_chunks` RPC takes
`p_org_id`. Service role key is server-side only — never client.

## Helpers

- `withOrg(orgId, row)` — stamps `org_id` on every write payload. Required.
- `useAuth()` — office session, JWT-derived `orgId` / `orgSlug` / `role` /
  `isPlatformAdmin`. `isPlatformAdmin` defaults `false`, never undefined.
- `useOrg()` — kitchen anon context, slug → org row.
- `useCategories()` — `recipe_categories` filtered by `org_id`.
- `current_org_id()` SQL — reads `app_metadata.org_id` from JWT.
- `is_platform_admin(uid)` SQL — `platform_admins` membership check.
- `org_id_for_inbound_key(p_key)` SQL — Postmark routing lookup.

## Where To Find What

| Need                               | Read                                            |
| ---------------------------------- | ----------------------------------------------- |
| Phase history, what shipped when   | `.claude/changes_made/CHANGES.md`               |
| Active phase + roadmap             | `IMPLEMENTATION_PLAN.md`                        |
| Auth + RLS + Phase 7.5 spec        | `memory/project_auth_decisions.md`              |
| Postmark routing detail            | `memory/project_postmark_routing.md`            |
| Default ACL gotcha (column REVOKE) | `memory/project_supabase_default_acl_gotcha.md` |
| Phase commit discipline            | `memory/project_phase_workflow.md`              |
| Project origin + tech stack        | `memory/project_context.md`                     |
| Collaboration style                | `memory/feedback_collaboration_style.md`        |
| Security review style              | `memory/feedback_call_out_security_risks.md`    |

## Session Initialization

At start of every new session:

1. Read `CHANGES.md` (project history)
2. Read this file (project context)
3. Read `IMPLEMENTATION_PLAN.md` (current phase)
4. Read `MEMORY.md` chain (auto-pulls all `project_*` and `feedback_*`)
5. Use `/superpowers` plugin
6. Summarize last 3 completed tasks + current phase
7. Output: `Context loaded. Ready to continue from [LAST TASK TITLE].`

If any file missing, flag immediately before any work.

## Behavioral Rules

1. It's ok to not know or be wrong — say so. Never guess to complete a task.
2. Ask clarifying questions before starting any significant request.
3. Offer suggestions when a better approach exists.
4. Use available tools for accurate info. No assumptions.
5. Double-check work before presenting it.
6. Refactor when needed. Delete dead code on sight.
7. Comment only where intent isn't obvious — non-trivial functions, complex
   blocks, surprising decisions. Skip self-explanatory code.
8. Never cut corners for speed, tokens, or to please.
9. Never store JWT locally.
10. **Every Supabase query is org-scoped.** Authenticated: RLS enforces
    server-side. Anon kitchen: always `.eq('org_id', orgId)` — RLS is currently
    `using (true)` for anon and isolation is app-side. No exceptions. Phase 7.5
    will move this to RLS-enforced; rule updates in that commit.
11. **Every INSERT/UPDATE uses `withOrg(orgId, row)`** before send.
12. Security is the user's #1 concern. Flag risks proactively. Define boundaries
    before writing code touching auth, RLS, JWTs, edge function auth, or
    service-role usage. When unsure, refuse to proceed and ask.
13. Ill trigger an end of session by saying "end of session" and you should
    update this file with any new log patterns, gotchas, conventions, and other
    context you discover that may be useful for future sessions.
14. All memory files must be written to C:\MisenMore\Misenmore\memory\MEMORY.md,
    not the default Claude memory path.

## Phase 7.5 Will Change

When Phase 7.5 ships, update in this file: rule 10 (anon RLS becomes the
barrier, not app-side), edge function list (add `kitchen-link-mutations`),
isolation paragraph (anon JWT carries `org_id`). Do not update preemptively.
