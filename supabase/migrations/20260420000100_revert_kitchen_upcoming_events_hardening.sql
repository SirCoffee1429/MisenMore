-- Phase 7 followup — revert an attempted hardening of the
-- kitchen_upcoming_events view.
--
-- A brief fixup migration tried two defense-in-depth moves against the
-- cross-tenant view semantics: security_invoker = true, plus a column
-- revoke of SELECT(notes) for anon. Both were undermined by Supabase's
-- default ACL on the public schema — anon holds a full-table SELECT
-- grant via default_privileges owned by supabase_admin, which Postgres
-- privilege-hierarchy-wise overrides any column-level revoke. Confirmed
-- empirically: anon could still select `notes` directly from
-- upcoming_banquets after the fixup.
--
-- The clean path would be to revoke the table-level SELECT and re-grant
-- only the safe columns, but that fights Supabase's default ACL pattern
-- and is fragile across schema changes.
--
-- Decision (locked in): the view stays owner-rights (security_invoker
-- is OFF, default). The threat model:
--
--   Anon: cross-tenant isolation is enforced app-side via
--     .eq('org_id', orgId) from the URL-slug-resolved OrgContext, per
--     CLAUDE.md rule 10. The view is a convenience projection that
--     keeps `notes` out of the default kitchen read path. A rogue anon
--     client bypassing .eq() would see all orgs' rows — same pattern
--     as briefings, workbooks, weekly_features, recipe_categories (all
--     `using (true)` policies).
--
--   Authenticated: isolation is enforced at the upcoming_banquets
--     table level by the "auth select own org" RLS policy from the
--     base Phase 7 migration. Authenticated code paths always read the
--     table directly (EventsBanquetsPage branches on readOnly so only
--     the kitchen/anon path hits the view). Cross-tenant via the view
--     is a theoretical vector that no code path exercises today.

alter view public.kitchen_upcoming_events set (security_invoker = false);

drop policy if exists "anon select upcoming_banquets" on public.upcoming_banquets;
