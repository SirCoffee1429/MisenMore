---
name: Supabase default ACL overrides column-level REVOKE
description: Column-level REVOKE SELECT on anon is silently overridden by Supabase's public-schema default_privileges — use table-level revoke + partial grant, and verify empirically
type: project
---

Phase 7 attempted to hide the `notes` column of `upcoming_banquets` from anon
with `revoke select (notes) on public.upcoming_banquets from anon`. The revoke
ran without error but had **no effect** — anon could still
`select notes from upcoming_banquets`.

**Root cause:** Supabase's `public` schema has `default_privileges` entries
owned by `supabase_admin` that grant `arwdDxtm` (all privileges including
full-table SELECT) on every table in `public` to `anon`, `authenticated`, and
`service_role`. Postgres privilege hierarchy: if a role has table-level SELECT,
column-level revokes are ignored.

**Confirmed empirically** in Phase 7 via MCP `execute_sql` with
`set local role anon; select notes from public.upcoming_banquets limit 1;` —
returned the row after the revoke.

**Phase 7.5 successfully applies the correct pattern** for column-level UPDATE
restrictions:

- `revoke update on public.briefing_tasks from anon; grant update (is_completed) on public.briefing_tasks to anon;`
- `revoke update on public.management_notes from anon; grant update (is_cleared, cleared_at, content, pinned) on public.management_notes to anon;`

The pattern works for column-level UPDATE because Phase 7 didn't grant
table-level UPDATE in the first place — only the policy permitted it. UPDATE
column grants narrow what the policy allows. SELECT is the trapped case because
table-level SELECT is in the default ACL.

**How to apply:**

- Column-level UPDATE restriction: revoke table UPDATE first, then grant on
  specific columns. Works.
- Column-level SELECT restriction: same sequence, but you're fighting Supabase's
  default ACL. Even after the revoke, future migrations or schema changes may
  reset privileges. Pair with a trigger or re-apply defensively if you need
  this.
- Phase 7.5 dropped `kitchen_upcoming_events` view entirely because the
  JWT-stamped `org_id` makes per-row anon access safe — column-level hiding is
  no longer needed for cross-tenant safety. If `notes` needs to be hidden from
  kitchen for product reasons within an org, do it at the SELECT call, not at
  RLS.
- `set local role anon` in MCP `execute_sql` does NOT enforce column-level
  privileges if the session user is a superuser. Row-level checks via MCP are
  reliable; column-level checks need a real anon-key HTTP request.
