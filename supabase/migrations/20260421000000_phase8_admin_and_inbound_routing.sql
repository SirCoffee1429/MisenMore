-- Phase 8 — admin tooling, multi-tenant Postmark routing, org_members RLS.
--
-- Adds:
--   1. organizations.inbound_email_key (per-org plus-address routing key)
--   2. platform_admins table (you, as the SaaS operator)
--   3. is_platform_admin() helper for RLS
--   4. org_id_for_inbound_key() helper used by Postmark edge functions
--   5. org_members RLS policies (self + same-org read, platform-admin full)
--   6. custom_access_token_hook: stamps is_platform_admin into JWT

-- 1. Per-org inbound email routing key.
--    Postmark inbound goes to e.g. sales+<key>@parse.misenmore.com; the
--    edge function parses the +key suffix and looks up the org. The key
--    is short, URL-safe, and unique. Default uses a 12-char slice of a
--    random uuid so existing rows backfill safely.
alter table public.organizations
  add column if not exists inbound_email_key text;

update public.organizations
   set inbound_email_key = replace(gen_random_uuid()::text, '-', '')
   where inbound_email_key is null;

alter table public.organizations
  alter column inbound_email_key set not null,
  alter column inbound_email_key set default replace(gen_random_uuid()::text, '-', '');

create unique index if not exists organizations_inbound_email_key_uniq
  on public.organizations (inbound_email_key);

-- 2. Platform admins table. Separate from org_members because platform
--    admins are not org-scoped — they are SaaS operators who can see
--    every org. Membership is intentionally insert-only via SQL editor
--    (no app-side path to grant platform admin).
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- platform_admins is readable only to the user themselves (so the JWT
-- hook can confirm membership) and to other platform admins. No
-- authenticated-only insert path.
create policy "self read platform_admins" on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid());

-- 3. is_platform_admin() — reads the JWT claim stamped by the hook.
--    Stable, no DB lookup at query time. Returns false for anon.
create or replace function public.is_platform_admin()
returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb
       #>>'{app_metadata,is_platform_admin}')::boolean,
    false
  );
$$;

-- 4. org_id_for_inbound_key — used by edge functions running under the
--    service role. Centralises the lookup so future routing changes
--    (e.g. soft-disable an inbound key) live in one place.
create or replace function public.org_id_for_inbound_key(p_key text)
returns uuid
language sql stable
set search_path = public, pg_temp
as $$
  select id from public.organizations where inbound_email_key = p_key;
$$;

-- 5. org_members RLS policies.
--    - Self-read: every authenticated user can see their own row.
--    - Same-org read: any authenticated user can see other rows in
--      their own org (so /admin and team pages can list coworkers).
--    - Platform admin: full CRUD across all orgs.
--    - No regular-user write path — membership is managed via /admin.
create policy "self read own membership" on public.org_members
  for select to authenticated
  using (user_id = auth.uid());

create policy "same-org read members" on public.org_members
  for select to authenticated
  using (org_id = public.current_org_id());

create policy "platform admin all org_members" on public.org_members
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Platform admins also need full CRUD on organizations to drive /admin.
-- The existing "auth read own org" policy stays in place; RLS policies
-- are OR'd together so org members keep their own-org read access.
create policy "platform admin all organizations" on public.organizations
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- 6. Update the JWT custom claim hook to also stamp is_platform_admin.
--    Falls back gracefully when the user has no org membership yet
--    (platform admins typically won't be a member of any single org).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  claims  jsonb;
  uid     uuid;
  org_row record;
  is_admin boolean;
begin
  claims := event->'claims';
  uid    := (event->>'user_id')::uuid;

  -- Org membership (nullable for platform-admin-only users).
  select m.org_id, m.role, o.slug
    into org_row
  from public.org_members m
  join public.organizations o on o.id = m.org_id
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if org_row.org_id is not null then
    claims := jsonb_set(claims, '{app_metadata,org_id}',
                to_jsonb(org_row.org_id::text));
    claims := jsonb_set(claims, '{app_metadata,org_slug}',
                to_jsonb(org_row.slug));
    claims := jsonb_set(claims, '{app_metadata,role}',
                to_jsonb(org_row.role));
  end if;

  -- Platform admin flag — always stamped (false when not in table) so
  -- the client can branch reliably without a missing-key check.
  select exists(select 1 from public.platform_admins where user_id = uid)
    into is_admin;
  claims := jsonb_set(claims, '{app_metadata,is_platform_admin}',
              to_jsonb(is_admin));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;
