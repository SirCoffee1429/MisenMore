# MisenMore — Change Log

---

### 2026-04-16 — Phase 2: Database Schema

**Type:** `feat`
**Summary:** Applied all 4 Phase 2 migrations to MisenMore Supabase project
`unqflkmrdfmxtggrcglc`. Clean-room multi-tenant schema: 13 tables, all domain
tables stamped with `org_id uuid not null references organizations(id) on
delete cascade`. Extensions (`pgcrypto`, `vector 0.8.0`), helper functions
(`current_org_id()`, `match_chunks()`), and IVFFlat vector index in place.
RLS enabled only on `organizations` and `org_members`; domain-table RLS
intentionally deferred to Phase 7 per plan.

**Details:**
- Migration `20260416022100_extensions_and_organizations` — enabled pgcrypto
  + pgvector, created `organizations` and `org_members` with RLS on (policies
  deferred to Phase 7). Indexes on `org_members.user_id` and `.org_id`
- Migration `20260416022344_domain_tables` — created 11 domain tables:
  `workbooks`, `workbook_sheets`, `workbook_chunks` (with `vector(768)`
  embedding column), `recipe_categories`, `briefings`, `briefing_tasks`,
  `sales_data`, `management_notes`, `upcoming_banquets`,
  `banquet_event_orders`, `weekly_features`. Every table has `org_id uuid
  not null references organizations(id) on delete cascade`. All check
  constraints and unique constraints from plan applied verbatim
- Migration `20260416023743_indexes` — 11 secondary indexes, all
  org_id-leading to match query patterns
- Migration `20260416025001_postgres_helpers` — `current_org_id()` reads
  `app_metadata.org_id` from JWT claims; `match_chunks(query_embedding,
  match_count, p_org_id)` returns top-N cosine-similar chunks scoped to
  a single org; IVFFlat cosine index on `workbook_chunks.embedding` with
  `lists = 100`
- Local migration files saved under `supabase/migrations/` with matching
  Supabase version timestamps so `supabase db pull` / `migration list`
  stay aligned with the remote

**Verification:**
- `list_tables(public)` returns all 13 tables, rows=0 for each
- `list_migrations` returns all 4 migration records in order
- `select public.current_org_id()` → null (expected; no JWT in SQL editor)
- `select count(*) from pg_proc where proname = 'match_chunks'` → 1
- `select extversion from pg_extension where extname = 'vector'` → 0.8.0
- IVFFlat index on workbook_chunks confirmed via `pg_indexes`
- Security advisors reviewed: RLS-off errors on domain tables are
  intentional (Phase 7 turns them on); INFO-level "RLS enabled no policy"
  on `organizations` + `org_members` expected (policies Phase 7)

**Followups (not Phase 2 scope):**
- WARN: `public.current_org_id` and `public.match_chunks` have mutable
  `search_path`. Hardening fix: `alter function ... set search_path = ''`.
  Worth addressing before Phase 7 RLS goes live
- WARN: `vector` extension is installed in `public` schema. Supabase
  recommends a dedicated `extensions` schema, but moving it would cascade
  through every `vector(768)` column — defer unless/until operational pain

**Next:** Phase 3 — Supabase Auth + `custom_access_token_hook` to stamp
`org_id`, `org_slug`, and `role` into JWT `app_metadata` on every token.

---

### 2026-04-15 — Phase 1: Project Foundation

**Type:** `feat`
**Summary:** Bootable local dev environment. DailyBrief's React app and
Supabase edge functions copied into MisenMore, rebranded, scrubbed of
DailyBrief's prod credentials, wired to MisenMore Supabase project
`unqflkmrdfmxtggrcglc` via `app/.env.local`. Vite dev server boots clean
on port 5173.

**Details:**
- Copied `app/` from `C:\Old Hawthorne Projects\DailyBrief\app\` excluding
  `node_modules/`, `dist/`, `sample-data/`, `out.json`, `read_beo.mjs`
  (44 files, 435 KB)
- Copied `supabase/functions/` (all 7 edge functions) and `supabase/config.toml`.
  Migrations NOT copied — Phase 2 authors clean-room schema
- `app/package.json`: name `dailybrief` → `misenmore`, added MisenMore description
- `app/src/lib/supabase.js`: removed hardcoded DailyBrief URL + anon key
  fallbacks, now throws if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`
  is missing — prevents silent cross-project contamination
- Created `app/.env.local` (gitignored) with MisenMore Supabase URL + anon key
- Created `app/.env.example` (committed template)
- Copied `.gitignore` from DailyBrief — covers `.env.*`, `node_modules/`,
  `dist/`, `.vercel/`, `supabase/.temp/`, `secrets.txt`
- Deleted `app/src/components/OfficeGate.jsx` and removed its import +
  14 wrappers from `App.jsx`. Office routes are temporarily ungated;
  Phase 4 reintroduces real auth via `ProtectedRoute`
- Rebranded visible DailyBrief references: `index.html` title/meta,
  `RoleSelect.jsx` h1, `index.css` and `mobile.css` comment headers
- `npm install` succeeded (100 packages); `npm audit fix` patched
  picomatch + vite advisories. `xlsx` retains 2 known high-severity
  advisories (prototype pollution, ReDoS) with no upstream fix —
  inherited from DailyBrief, tracked as Phase 1 followup
- `supabase/config.toml` had no `project_id` field, only edge function
  config — no change needed. Project binding will happen at Phase 6
  deploy time via `--project-ref unqflkmrdfmxtggrcglc` or `supabase link`

**Verification:**
- Vite dev server booted on port 5173 in 287 ms, no terminal errors
- `index.html`, `main.jsx`, `App.jsx`, `lib/supabase.js` all serve `200`
  and compile via Vite's HMR transform
- Fail-fast confirmed: with `.env.local` removed, the served
  `lib/supabase.js` shows `import.meta.env` containing only
  `BASE_URL/DEV/MODE/PROD/SSR` — the throw fires at module load
- Grep for `dailybrief`, `DailyBrief`, `chajwmoohmiugdgvqjyo` across
  `app/` and `supabase/`: zero matches
- `git check-ignore` confirms `app/.env.local` and `app/node_modules/`
  are excluded from tracking

**Followups (not Phase 1 scope):**
- xlsx high-severity advisories — evaluate replacement (e.g. `exceljs`)
  before any prod deploy
- Phase 2 will author clean-room SQL migrations against the empty
  MisenMore database

**Next:** Phase 2 — Database schema (organizations, org_members, all
domain tables with `org_id` from day one).

---

### 2026-04-14 — Project Initialized

**Type:** `init`
**Summary:** MisenMore created as a multi-tenant commercial product forked from
DailyBrief (Old Hawthorne Country Club's standalone app). DailyBrief remains
untouched as a permanently single-org app.

**Details:**
- New GitHub repo: https://github.com/SirCoffee1429/MisenMore
- New Supabase project: unqflkmrdfmxtggrcglc (same Supabase org as DailyBrief, accessible via MCP)
- CLAUDE.md written with full project context, architecture, and behavior rules
- IMPLEMENTATION_PLAN.md written with 8-phase build plan
- Phase 0 complete: architecture finalized, all decisions made
- Next: Phase 1 — Project Foundation (copy DailyBrief code, connect to new Supabase)

---
