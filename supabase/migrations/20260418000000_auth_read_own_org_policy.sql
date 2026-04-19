-- Pulled forward from Phase 7. Allows authenticated users to read their own
-- org row. Required for OrgProvider slug lookups when a manager has an active
-- session (Supabase JS client sends the JWT on all queries, including kitchen
-- route org resolution). Without this, the authenticated role returns zero rows
-- from organizations because RLS has no matching policy.
create policy "auth read own org" on public.organizations
  for select to authenticated
  using (id = public.current_org_id());
