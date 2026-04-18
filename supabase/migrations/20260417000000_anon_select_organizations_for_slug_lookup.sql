-- Phase 4 prerequisite: OrgContext (anon kitchen routes) resolves :orgSlug
-- by selecting from public.organizations. RLS is on with no policies, so
-- without this policy anon SELECT returns zero rows and OrgContext can
-- never resolve a slug. The table holds nothing sensitive (id, slug, name,
-- settings); kitchen URLs already expose the slug. This is the same
-- "anon read orgs for slug lookup" policy specified in Phase 7 — pulled
-- forward so OrgContext is verifiable as soon as it's written.
create policy "anon read orgs for slug lookup"
  on public.organizations
  for select
  to anon
  using (true);
