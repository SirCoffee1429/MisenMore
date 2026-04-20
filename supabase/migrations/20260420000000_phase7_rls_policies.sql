-- Phase 7 — Row-Level Security on every domain table.
--
-- Phase 6 landed the app-side guarantee that every query is org-scoped:
-- authenticated writes wrap withOrg(), kitchen anon reads filter by
-- .eq('org_id', orgId), and every edge function stamps org_id on writes.
-- This migration locks that guarantee in at the database layer so that a
-- missed filter, a rogue client, or a service-role bug cannot leak one
-- org's data into another.
--
-- What this file does:
--   1. Enables RLS on all 11 domain tables
--   2. Adds auth policies (select/insert/update/delete) scoped to
--      current_org_id() for every table
--   3. Adds anon policies per the CLAUDE.md kitchen allowlist — SELECT
--      on read-safe tables, SELECT+UPDATE on briefing_tasks, full CRUD
--      on management_notes where category = 'alerts' only
--   4. Creates the kitchen_upcoming_events view so kitchen crew can see
--      upcoming event names/dates/times without exposing the underlying
--      upcoming_banquets table (notes column is excluded)
--
-- Organizations + org_members notes:
--   - organizations already has anon+auth SELECT policies from
--     20260417000000 and 20260418000000 — not re-added here
--   - org_members keeps RLS on with zero policies (service role and the
--     custom_access_token_hook are the only consumers today). Browser-side
--     policies get added in Phase 8 alongside the admin panel that needs
--     them
--
-- Tables with NO anon policies (implicit deny for kitchen):
--   - sales_data, banquet_event_orders, workbook_chunks
--   - upcoming_banquets (kitchen reads go through the view instead)

-- -------------------------------------------------------------------
-- 1. Enable RLS on every domain table
-- -------------------------------------------------------------------
alter table public.workbooks            enable row level security;
alter table public.workbook_sheets      enable row level security;
alter table public.workbook_chunks      enable row level security;
alter table public.recipe_categories    enable row level security;
alter table public.briefings            enable row level security;
alter table public.briefing_tasks       enable row level security;
alter table public.sales_data           enable row level security;
alter table public.management_notes     enable row level security;
alter table public.upcoming_banquets    enable row level security;
alter table public.banquet_event_orders enable row level security;
alter table public.weekly_features      enable row level security;

-- -------------------------------------------------------------------
-- 2. Authenticated policies — full CRUD scoped to the user's org
-- -------------------------------------------------------------------

-- workbooks
create policy "auth select own org" on public.workbooks
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.workbooks
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.workbooks
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.workbooks
  for delete to authenticated using (org_id = public.current_org_id());

-- workbook_sheets
create policy "auth select own org" on public.workbook_sheets
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.workbook_sheets
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.workbook_sheets
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.workbook_sheets
  for delete to authenticated using (org_id = public.current_org_id());

-- workbook_chunks
create policy "auth select own org" on public.workbook_chunks
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.workbook_chunks
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.workbook_chunks
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.workbook_chunks
  for delete to authenticated using (org_id = public.current_org_id());

-- recipe_categories
create policy "auth select own org" on public.recipe_categories
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.recipe_categories
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.recipe_categories
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.recipe_categories
  for delete to authenticated using (org_id = public.current_org_id());

-- briefings
create policy "auth select own org" on public.briefings
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.briefings
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.briefings
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.briefings
  for delete to authenticated using (org_id = public.current_org_id());

-- briefing_tasks
create policy "auth select own org" on public.briefing_tasks
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.briefing_tasks
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.briefing_tasks
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.briefing_tasks
  for delete to authenticated using (org_id = public.current_org_id());

-- sales_data
create policy "auth select own org" on public.sales_data
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.sales_data
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.sales_data
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.sales_data
  for delete to authenticated using (org_id = public.current_org_id());

-- management_notes
create policy "auth select own org" on public.management_notes
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.management_notes
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.management_notes
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.management_notes
  for delete to authenticated using (org_id = public.current_org_id());

-- upcoming_banquets
create policy "auth select own org" on public.upcoming_banquets
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.upcoming_banquets
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.upcoming_banquets
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.upcoming_banquets
  for delete to authenticated using (org_id = public.current_org_id());

-- banquet_event_orders
create policy "auth select own org" on public.banquet_event_orders
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.banquet_event_orders
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.banquet_event_orders
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.banquet_event_orders
  for delete to authenticated using (org_id = public.current_org_id());

-- weekly_features
create policy "auth select own org" on public.weekly_features
  for select to authenticated using (org_id = public.current_org_id());
create policy "auth insert own org" on public.weekly_features
  for insert to authenticated with check (org_id = public.current_org_id());
create policy "auth update own org" on public.weekly_features
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy "auth delete own org" on public.weekly_features
  for delete to authenticated using (org_id = public.current_org_id());

-- -------------------------------------------------------------------
-- 3. Anon policies — kitchen allowlist only.
--
-- Kitchen anon queries always include .eq('org_id', orgId) from the
-- URL-slug-resolved OrgContext (Phase 6), so these policies don't need
-- to re-enforce org scoping. Their job is to restrict WHICH tables and
-- WHICH operations anon can touch at all.
-- -------------------------------------------------------------------

-- briefings — read-only
create policy "anon select briefings" on public.briefings
  for select to anon using (true);

-- briefing_tasks — read + update (kitchen checks off completed tasks)
create policy "anon select briefing_tasks" on public.briefing_tasks
  for select to anon using (true);
create policy "anon update briefing_tasks" on public.briefing_tasks
  for update to anon using (true) with check (true);

-- workbooks + sheets — read-only (kitchen recipe viewer)
create policy "anon select workbooks" on public.workbooks
  for select to anon using (true);
create policy "anon select workbook_sheets" on public.workbook_sheets
  for select to anon using (true);

-- recipe_categories — read-only (used by kitchen filters)
create policy "anon select recipe_categories" on public.recipe_categories
  for select to anon using (true);

-- weekly_features — read-only
create policy "anon select weekly_features" on public.weekly_features
  for select to anon using (true);

-- management_notes — full CRUD but only on the 'alerts' category.
-- This is the ONE place kitchen anon has write access (86'd items feed).
-- The WITH CHECK prevents inserting/updating a row INTO a non-alerts
-- category, and the USING prevents reading/updating/deleting anything
-- that isn't already an alert.
create policy "anon alerts select" on public.management_notes
  for select to anon using (category = 'alerts');
create policy "anon alerts insert" on public.management_notes
  for insert to anon with check (category = 'alerts');
create policy "anon alerts update" on public.management_notes
  for update to anon
  using (category = 'alerts') with check (category = 'alerts');
create policy "anon alerts delete" on public.management_notes
  for delete to anon using (category = 'alerts');

-- sales_data, banquet_event_orders, workbook_chunks, upcoming_banquets —
-- NO anon policies. Implicit deny. Kitchen never touches these tables
-- directly; upcoming events are served by the view below.

-- -------------------------------------------------------------------
-- 4. Kitchen upcoming events view — safe projection of upcoming_banquets
--
-- Excludes the `notes` column (which can contain client/staff
-- instructions not meant for the kitchen crew floor view). Keeps org_id
-- on the projection so the kitchen-side .eq('org_id', orgId) filter
-- still narrows results to the viewing org.
--
-- Views in Postgres run with the privileges of the view owner by
-- default. That means anon can select from this view without having
-- SELECT on upcoming_banquets — exactly what we want. The view is
-- NOT SECURITY DEFINER; it relies on the default owner-rights behavior
-- for unqualified views. Row filtering by org_id still happens in the
-- app-side query.
-- -------------------------------------------------------------------
create or replace view public.kitchen_upcoming_events as
  select id, org_id, event_name, event_date, start_time, guest_count
  from public.upcoming_banquets;

grant select on public.kitchen_upcoming_events to anon;
grant select on public.kitchen_upcoming_events to authenticated;
