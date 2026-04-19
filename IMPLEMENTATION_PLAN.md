# MisenMore — Implementation Plan

## Overview

MisenMore is built from scratch with multi-tenancy as a first-class concern.
The foundation is DailyBrief's UI and component code, but every table, query,
route, and auth decision is designed for multiple orgs from day one. There is
no migration or backfill — the schema is clean from the first commit.

---

## Current Status

- [x] Phase 0 — Project setup (repo + Supabase project created)
- [x] Phase 1 — Project foundation (copy DailyBrief code, configure for MisenMore)
- [x] Phase 2 — Database schema (all tables with org_id from day one)
- [x] Phase 3 — Supabase Auth + JWT custom claim hook
- [x] Phase 4 — Auth/Org React contexts + Login page + ProtectedRoute
- [x] Phase 5 — Route structure (/k/:orgSlug, /o/:orgSlug)
- [ ] Phase 6 — Rebuild all queries to be org-scoped
- [ ] Phase 7 — RLS policies on all tables
- [ ] Phase 8 — Admin tooling + first org provisioning

---

## Phase 1 — Project Foundation

**Goal:** Get a working local dev environment with DailyBrief's codebase as the
starting point, connected to the new MisenMore Supabase project.

### Steps

1. Copy DailyBrief's `app/` directory structure into MisenMore repo
2. Copy DailyBrief's `supabase/` directory (functions + config)
3. Update `package.json` — name: `misenmore`, update description
4. Create `.env.local`:
   ```
   VITE_SUPABASE_URL=https://unqflkmrdfmxtggrcglc.supabase.co
   VITE_SUPABASE_ANON_KEY=<new project anon key>
   ```
5. Update `app/src/lib/supabase.js` to use `import.meta.env` vars
6. Remove `OfficeGate.jsx` — replaced by ProtectedRoute in Phase 4
7. Verify `npm install && npm run dev` boots without errors

### Verification
- App loads at localhost:5173
- No console errors on load

---

## Phase 2 — Database Schema

**Goal:** Create all tables in the new Supabase project with `org_id` on every
domain table from the start. No backfill ever needed.

Run these migrations in order in the Supabase SQL editor
(project: zbyssetrxjrrokidsldo).

### Migration 1 — Extensions and organizations

```sql
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Core org table
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Links Supabase auth users to orgs with roles
create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','kitchen_staff')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index on public.org_members (user_id);
create index on public.org_members (org_id);

alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
```

### Migration 2 — Domain tables (all with org_id)

```sql
-- Recipe workbooks
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

create table public.workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  sheet_name text,
  sheet_index int default 0,
  headers jsonb,
  rows jsonb
);

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

-- Recipe categories
create table public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

-- Briefings and tasks
create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.briefing_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  briefing_id uuid not null references public.briefings(id) on delete cascade,
  description text not null,
  is_completed boolean not null default false,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- Sales data
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

-- Management notes (alerts + comms)
create table public.management_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  content text not null,
  author text,
  category text not null default 'comms',
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Events and banquets
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

-- Weekly features
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
```

### Migration 3 — Indexes

```sql
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
```

### Migration 4 — Postgres helpers

```sql
-- Returns the org_id from the current JWT (used by RLS policies)
create or replace function public.current_org_id()
returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb
        #>>'{app_metadata,org_id}',
      ''
    ),
    ''
  )::uuid;
$$;

-- match_chunks scoped to org (used by kitchen-assistant edge function)
create or replace function public.match_chunks(
  query_embedding vector(768),
  match_count int,
  p_org_id uuid
)
returns table (
  id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from public.workbook_chunks
  where org_id = p_org_id
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- IVFFlat vector index for fast similarity search
create index on public.workbook_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

### Verification
- All 13 tables exist in Supabase dashboard
- `select * from organizations` returns empty (no data yet — that's correct)
- `select public.current_org_id()` returns null (no JWT in SQL editor — correct)

---

## Phase 3 — Supabase Auth + JWT Custom Claim Hook

**Goal:** Enable email/password auth and stamp `org_id`, `org_slug`, and `role`
into every JWT so RLS policies can read them without extra DB lookups.

### Migration 5 — Custom access token hook

```sql
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
begin
  claims := event->'claims';
  uid    := (event->>'user_id')::uuid;

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

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from authenticated, anon, public;
```

After running the migration, enable the hook in the Supabase dashboard:
**Authentication → Hooks → Custom Access Token → select
`public.custom_access_token_hook`**

### Verification
- Create a test user in Auth dashboard
- Insert an org + org_members row for that user
- Sign in and decode the JWT at jwt.io — confirm `app_metadata.org_id` is present

---

## Phase 4 — React Auth/Org Contexts + Login Page + ProtectedRoute

**Goal:** Wire Supabase Auth into the React app. Kitchen routes use OrgContext
(anon, slug-based). Office routes use AuthContext (session-based).

### Files to create

- `app/src/lib/auth/AuthContext.jsx`
- `app/src/lib/auth/useAuth.js`
- `app/src/lib/org/OrgContext.jsx`
- `app/src/lib/org/useOrg.js`
- `app/src/lib/org/withOrg.js`
- `app/src/pages/Login.jsx`
- `app/src/components/ProtectedRoute.jsx`

### AuthContext responsibilities
- Wraps `supabase.auth.onAuthStateChange`
- Exposes `{ session, user, orgId, orgSlug, role, loading, signIn, signOut }`
- Reads `session.user.app_metadata.org_id` / `org_slug` / `role`
- On sign-in success, redirects to `/o/:orgSlug`

### OrgContext responsibilities
- Receives `slug` prop from route params
- On mount: `supabase.from('organizations').select().eq('slug', slug).single()`
- Exposes `{ orgId, orgSlug, orgName, loading, error }`
- If slug not found, sets error state — parent renders 404

### withOrg helper
```js
// Stamps org_id onto every write payload — required for all inserts/updates
export function withOrg(orgId, row) {
  if (Array.isArray(row)) return row.map(r => ({ ...r, org_id: orgId }))
  return { ...row, org_id: orgId }
}
```

### ProtectedRoute responsibilities
- Reads AuthContext
- If loading: show spinner
- If no session: redirect to `/login`
- If session but no `org_id` in JWT: show "Account not provisioned" message
- If org slug in URL doesn't match JWT org_slug: redirect to correct org

### Login page
- Email + password form
- Calls `supabase.auth.signInWithPassword`
- On success: redirects to `/o/:orgSlug` from JWT
- Error states: invalid credentials, unprovisioned account

### Verification
- Manager signs in, JWT contains `app_metadata.org_id`
- Visiting `/o/test-org` without session redirects to `/login`
- Visiting `/k/test-org` anonymously loads (OrgContext resolves slug)
- Visiting `/k/nonexistent-slug` shows 404 state

---

## Phase 5 — Route Structure

**Goal:** Wire all routes to use org slug params. Both layouts
(`KitchenLayout`, `OfficeLayout`) read from context, not hardcoded paths.

### App.jsx route tree

```jsx
<AuthProvider>
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />

    {/* Kitchen — anonymous, org from slug */}
    <Route path="/k/:orgSlug" element={<OrgResolver><KitchenLayout /></OrgResolver>}>
      <Route index element={<Dashboard />} />
      <Route path="recipes" element={<KitchenRecipes />} />
      <Route path="recipes/create" element={<RecipeCreator />} />
      <Route path="briefings" element={<Briefings />} />
      <Route path="events" element={<EventsBanquetsPage readOnly />} />
      <Route path="chat" element={<AiChat />} />
    </Route>

    {/* Office — auth required */}
    <Route path="/o/:orgSlug" element={<ProtectedRoute><OfficeLayout /></ProtectedRoute>}>
      <Route index element={<OfficeDashboard />} />
      <Route path="briefings" element={<Briefings />} />
      <Route path="briefings/new" element={<BriefingEditor />} />
      <Route path="briefings/:id/edit" element={<BriefingEditor />} />
      <Route path="workbooks" element={<WorkbookLibrary />} />
      <Route path="workbooks/upload" element={<WorkbookUpload />} />
      <Route path="workbooks/create" element={<RecipeCreator />} />
      <Route path="workbooks/:id" element={<WorkbookViewer />} />
      <Route path="sales" element={<SalesReports />} />
      <Route path="sales/:date" element={<SalesReportDetail />} />
      <Route path="events" element={<EventsBanquetsPage />} />
      <Route path="board" element={<ManagementBoardPage />} />
      <Route path="history" element={<History />} />
    </Route>
  </Routes>
</AuthProvider>
```

### Navigation updates
- `KitchenLayout` nav links use `/k/${orgSlug}/...` from `useOrg()`
- `OfficeLayout` nav links use `/o/${orgSlug}/...` from `useAuth()`
- No hardcoded `/kitchen` or `/office` paths anywhere

### Verification
- All nav tabs route correctly in both layouts
- Refreshing on any route keeps correct context
- Unknown slugs render 404

---

## Phase 6 — Rebuild All Queries as Org-Scoped

**Goal:** Every Supabase query in every component passes org_id. Every write
uses `withOrg()`. Every edge function stamps org_id.

### Frontend query rules
- **Anon (kitchen):** always `.eq('org_id', orgId)` where `orgId` comes from
  `useOrg()`
- **Authenticated (office):** RLS enforces org_id server-side; still pass
  `orgId` on all INSERTs via `withOrg()`
- **Guards:** never issue a query if `orgId` is null — return loading state

### Files to update (27 call sites from Phase 0 inventory)

| File | Change needed |
|---|---|
| `lib/useCategories.js` | Add `.eq('org_id', orgId)` param |
| `Dashboard.jsx` | Pass orgId to all queries |
| `OfficeDashboard.jsx` | Pass orgId to all queries |
| `Briefings.jsx` | Add org filter; wrap writes with withOrg |
| `BriefingEditor.jsx` | Add org filter; wrap writes with withOrg |
| `History.jsx` | Add org filter |
| `KitchenRecipes.jsx` | Add org filter |
| `WorkbookLibrary.jsx` | Add org filter; wrap writes |
| `WorkbookUpload.jsx` | Wrap all inserts with withOrg |
| `WorkbookViewer.jsx` | Add org filter |
| `RecipeCreator.jsx` | Wrap all inserts with withOrg |
| `SalesReports.jsx` | Add org filter (office only) |
| `SalesReportDetail.jsx` | Add org filter (office only) |
| `SalesTrendChart.jsx` | Add org filter (office only) |
| `EightySixFeed.jsx` | Add org filter; wrap writes |
| `EventsBanquetsPage.jsx` | Add org filter; wrap writes |
| `ManagementWhiteboard.jsx` | Add org filter; wrap writes |
| `WeeklyFeatures.jsx` | Add org filter; wrap writes |
| `kitchen-assistant` fn | Add p_org_id to match_chunks call |
| `embed-chunks` fn | Accept org_id in payload, stamp on chunks |
| `process-sales-data` fn | Accept/stamp org_id (hardcode for now) |
| `process-beo` fn | Accept/stamp org_id |
| `process-banquets` fn | Accept/stamp org_id |

### SalesBriefing note
`SalesBriefing` queries `sales_data` and was on the kitchen dashboard in
DailyBrief. In MisenMore it is **office dashboard only**. Remove it from any
kitchen route.

### Verification
- Full smoke test: every page loads data for the correct org
- Open browser console, attempt `supabase.from('sales_data').select()` as anon
  — must return no rows (RLS blocks it before kitchen query lands)
- Two test orgs: confirm Org A cannot see Org B data

---

## Phase 7 — RLS Policies

**Goal:** Flip on RLS for all tables and lock down every policy. Phase 6 must
be complete first — turning on RLS before queries are org-scoped breaks the app.

### Enable RLS on all domain tables

```sql
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
```

### Authenticated policies (template — repeat for each table)

```sql
-- Example: briefings
create policy "auth select own org" on public.briefings
  for select to authenticated
  using (org_id = public.current_org_id());

create policy "auth insert own org" on public.briefings
  for insert to authenticated
  with check (org_id = public.current_org_id());

create policy "auth update own org" on public.briefings
  for update to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy "auth delete own org" on public.briefings
  for delete to authenticated
  using (org_id = public.current_org_id());
```

### Anon policies (kitchen allowlist only)

```sql
-- briefings, briefing_tasks, workbooks, workbook_sheets,
-- recipe_categories, weekly_features: SELECT only
create policy "anon select briefings" on public.briefings
  for select to anon using (true);

-- briefing_tasks: SELECT + UPDATE (task completion toggle)
create policy "anon select briefing_tasks" on public.briefing_tasks
  for select to anon using (true);
create policy "anon update briefing_tasks" on public.briefing_tasks
  for update to anon
  using (true) with check (true);

-- management_notes: anon can full CRUD on alerts category only
create policy "anon alerts select" on public.management_notes
  for select to anon using (category = 'alerts');
create policy "anon alerts insert" on public.management_notes
  for insert to anon with check (category = 'alerts');
create policy "anon alerts delete" on public.management_notes
  for delete to anon using (category = 'alerts');
create policy "anon alerts update" on public.management_notes
  for update to anon
  using (category = 'alerts') with check (category = 'alerts');

-- upcoming_banquets: anon reads via a safe view (names/dates only)
create or replace view public.kitchen_upcoming_events as
  select id, org_id, event_name, event_date, start_time, guest_count
  from public.upcoming_banquets;
grant select on public.kitchen_upcoming_events to anon;
```

No anon policy = implicit deny. `sales_data`, `banquet_event_orders`, and
`workbook_chunks` have NO anon policies.

### Organizations anon policy (slug lookup only)

```sql
create policy "anon read orgs for slug lookup" on public.organizations
  for select to anon using (true);

create policy "auth read own org" on public.organizations
  for select to authenticated
  using (id = public.current_org_id());
```

### Verification
- Smoke test every page — data loads correctly
- Anon: `supabase.from('sales_data').select()` returns empty/denied
- Anon: `supabase.from('management_notes').select()` returns only alerts rows
- Cross-tenant: Org A user cannot read Org B rows

---

## Phase 8 — Admin Tooling + First Org Provisioning

**Goal:** Provision the first real org, invite the first manager, verify the
end-to-end flow works, and add lightweight admin capability.

### Steps

1. **Create first org** — run in Supabase SQL editor:
   ```sql
   insert into public.organizations (slug, name)
   values ('your-org-slug', 'Your Org Name');
   ```

2. **Create manager account** — in Supabase Auth dashboard, create the user
   manually with their email + temporary password.

3. **Link user to org** — run:
   ```sql
   insert into public.org_members (org_id, user_id, role)
   values (
     (select id from organizations where slug = 'your-org-slug'),
     (select id from auth.users where email = 'manager@email.com'),
     'manager'
   );
   ```

4. **Verify JWT** — manager signs in, decode JWT at jwt.io, confirm
   `app_metadata.org_id` and `org_slug` are present.

5. **Test full flow** — create briefing, upload recipe, post 86'd alert from
   kitchen, verify data is isolated to that org.

6. **Postmark routing** — add `inbound_email_key` to `organizations` table.
   Update `process-sales-data`, `process-banquets`, `process-beo` edge
   functions to look up org by key instead of hardcoding.

7. **Admin panel** (lightweight) — a simple `/admin` route gated by
   `is_platform_admin` flag in `app_metadata`. Shows org list, create org form,
   invite manager form.

### Verification
- Full end-to-end test with a real org: kitchen crew visits `/k/:slug`, office
  manager visits `/o/:slug`, all features work, data doesn't leak
- Second test org created — zero cross-contamination confirmed

---

## Build Order Dependencies

```
Phase 2 (schema) → Phase 3 (auth hook) → Phase 4 (React auth)
     → Phase 5 (routes) → Phase 6 (queries) → Phase 7 (RLS) → Phase 8
```

**Never enable RLS (Phase 7) before queries are org-scoped (Phase 6).**
**Never deploy edge function changes (Phase 6) before the schema supports org_id (Phase 2).**

---

## Success Criteria

- [ ] Manager signs in at `/login`, lands on `/o/:orgSlug`
- [ ] Kitchen crew visits `/k/:orgSlug` anonymously, sees briefings/recipes/tasks
- [ ] Kitchen crew cannot reach sales, BEO financials, or management comms
- [ ] Two orgs provisioned — zero data cross-contamination
- [ ] All 7 edge functions stamp org_id on every write
- [ ] RLS blocks anon access to sales_data, banquet_event_orders, workbook_chunks
- [ ] `OfficeGate.jsx` and hardcoded passwords do not exist in this codebase
- [ ] All queries use `withOrg()` on writes and `.eq('org_id', orgId)` on anon reads
