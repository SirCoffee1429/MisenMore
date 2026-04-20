---
name: Supabase default ACL overrides column-level REVOKE
description: Column-level REVOKE SELECT on anon is silently overridden by Supabase's public-schema default_privileges — use table-level revoke + partial grant, and verify empirically
type: project
---

Phase 7 attempted to hide the `notes` column of `upcoming_banquets` from anon with `revoke select (notes) on public.upcoming_banquets from anon`. The revoke ran without error but had **no effect** — anon could still `select notes from upcoming_banquets`.

**Root cause:** Supabase's `public` schema has `default_privileges` entries owned by `supabase_admin` that grant `arwdDxtm` (all privileges including full-table SELECT) on every table in `public` to `anon`, `authenticated`, and `service_role`. Postgres privilege hierarchy: if a role has table-level SELECT, column-level revokes are ignored. Column-level revoke can only restrict columns if the role does NOT already have table-level SELECT.

**Confirmed empirically** via MCP `execute_sql` with `set local role anon; select notes from public.upcoming_banquets limit 1;` — returned the row after the revoke, proving the revoke didn't take effect.

**How to apply:**
- If you ever need to restrict anon to specific columns of a public-schema table, the sequence is:
  1. `revoke select on public.<table> from anon` (table-level first)
  2. `grant select (<col1>, <col2>, ...) on public.<table> to anon` (only safe columns)
  3. Verify with `set local role anon; select <restricted_col> from public.<table>;` — should error, not return rows
- Even then, Supabase's default ACL may reset privileges on new migrations that touch the table. Pair with a trigger or re-apply the revoke defensively.
- A second trap: `set local role anon` in MCP `execute_sql` does not fully enforce column privileges because the MCP session user is a superuser. True verification requires a real anon-key HTTP request. Phase 7 caught the column-revoke failure via the empirical SELECT because Postgres DOES check column grants during SET LOCAL ROLE — but don't generalize this to "MCP role simulation is as good as a real anon client." Row-level checks via MCP are reliable; column-level checks need a real client.
- For Phase 7 we chose to leave `kitchen_upcoming_events` as owner-rights (security_definer) and live with the Supabase advisor's ERROR-level `security_definer_view` lint rather than fight the default ACL. Re-litigate if/when a stronger column boundary is needed.
