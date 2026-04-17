-- Phase 2 Migration 2 — All domain tables.
-- Every table carries org_id uuid not null references organizations(id).
-- RLS is NOT enabled here — Phase 7 turns it on after Phase 6 scopes
-- every query by org_id. Enabling RLS too early would break the app.

-- Recipe workbooks (uploaded files)
create table public.workbooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  file_url text,
  file_size bigint,
  sheet_count int default 0,
  status text default 'pending',
  category text[],
  uploaded_at timestamptz not null default now()
);

-- Parsed sheet rows from spreadsheet uploads
create table public.workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  sheet_name text,
  sheet_index int default 0,
  headers jsonb,
  rows jsonb
);

-- Text chunks + Gemini 768-dim embeddings for RAG retrieval
create table public.workbook_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  sheet_name text,
  content text,
  row_start int,
  row_end int,
  embedding vector(768)
);

-- Org-managed recipe category list (duplicates prevented per-org)
create table public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

-- Daily shift briefings
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Tasks attached to briefings; kitchen anon can toggle is_completed
create table public.briefing_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  briefing_id uuid not null references public.briefings(id) on delete cascade,
  description text not null,
  is_completed boolean not null default false,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- Nightly sales parsed from Postmark inbound emails. Office-only.
-- Kitchen anon has zero RLS access here — financial boundary.
create table public.sales_data (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_name text,
  units_sold int default 0,
  category text,
  report_date date,
  unit_price numeric default 0,
  total_net_sales numeric default 0,
  discounts numeric default 0,
  net_sales numeric default 0,
  tax numeric default 0
);

-- Management comms + 86'd alerts, separated by category field.
-- Kitchen anon CRUD is limited to category = 'alerts' only (Phase 7).
create table public.management_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  content text not null,
  author text,
  category text not null default 'comms',
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Upcoming event summaries scraped from ReserveCloud. Kitchen reads via
-- the kitchen_upcoming_events view (no financials exposed).
create table public.upcoming_banquets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_name text,
  event_date date,
  guest_count int,
  notes text,
  start_time text,
  created_at timestamptz not null default now()
);

-- Structured BEOs with food items + quantities. Office-only (contains
-- financial + client data). Kitchen anon has zero RLS access.
create table public.banquet_event_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_name text,
  event_date date,
  guest_count int,
  start_time text,
  food_items jsonb,
  completed boolean default false,
  created_at timestamptz not null default now()
);

-- Scheduled weekly lunch/dinner features (one row per day+meal per week)
create table public.weekly_features (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  week_start date not null,
  day_of_week int not null,
  meal text not null check (meal in ('lunch','dinner')),
  content text,
  updated_at timestamptz,
  unique (org_id, week_start, day_of_week, meal)
);
