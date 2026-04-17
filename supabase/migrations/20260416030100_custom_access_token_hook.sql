-- Phase 3 Migration 2 — Custom access token hook.
-- Runs at every JWT issuance (sign-in, refresh) and stamps the caller's
-- org_id, org_slug, and role into app_metadata. Phase 4 React contexts read
-- these claims directly; Phase 7 RLS policies read them via current_org_id().
-- Users with no org_members row get a JWT with no claims added — the React
-- ProtectedRoute shows an "Account not provisioned" state for those cases.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- claims holds the claims subtree we mutate and hand back
  claims  jsonb;
  -- uid is the signing-in user's auth.users.id
  uid     uuid;
  -- org_row carries the single membership row we resolve for this user
  org_row record;
begin
  claims := event->'claims';
  uid    := (event->>'user_id')::uuid;

  -- Resolve the user's primary org membership. If a user belongs to more
  -- than one org we take the oldest membership — multi-org switching is a
  -- future phase and will need a different resolution rule.
  select m.org_id, m.role, o.slug
    into org_row
  from public.org_members m
  join public.organizations o on o.id = m.org_id
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  -- Only stamp claims if a membership exists. Missing claims are the signal
  -- the React app uses to surface the unprovisioned-account state.
  if org_row.org_id is not null then
    claims := jsonb_set(claims, '{app_metadata,org_id}',
                to_jsonb(org_row.org_id::text));
    claims := jsonb_set(claims, '{app_metadata,org_slug}',
                to_jsonb(org_row.slug));
    claims := jsonb_set(claims, '{app_metadata,role}',
                to_jsonb(org_row.role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the auth system should ever invoke this hook. Revoke from everyone
-- else first (including implicit PUBLIC) so a leaked role can't call it
-- directly to probe membership state.
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
