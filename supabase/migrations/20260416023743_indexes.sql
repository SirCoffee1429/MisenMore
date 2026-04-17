-- Phase 2 Migration 3 — Secondary indexes.
-- org_id leads every index because every query filters by org first
-- (either through RLS or an explicit .eq('org_id', orgId) for anon).

create index on public.workbooks (org_id);
create index on public.workbook_sheets (org_id, workbook_id);
create index on public.workbook_chunks (org_id);
create index on public.recipe_categories (org_id);
create index on public.briefings (org_id, date desc);
create index on public.briefing_tasks (org_id, briefing_id);
create index on public.sales_data (org_id, report_date desc);
create index on public.management_notes (org_id, category);
create index on public.upcoming_banquets (org_id, event_date);
create index on public.banquet_event_orders (org_id, event_date);
create index on public.weekly_features (org_id, week_start);
