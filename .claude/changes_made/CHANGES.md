# MisenMore — Change Log

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
