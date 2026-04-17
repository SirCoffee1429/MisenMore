# MisenMore — Project Brief

## What This App Is

MisenMore is a universal multi-tenant kitchen and restaurant management platform
built for scaling across multiple organizations — country clubs, restaurants,
hotels, and any food service operation. It serves two types of users per
organization: kitchen crew (no login required) and office/management (email +
password auth).

MisenMore is a commercial product forked from DailyBrief, the standalone kitchen
management app built for Old Hawthorne Country Club. The UI, component logic,
and feature set are inherited from DailyBrief and rebuilt with multi-tenancy,
real authentication, and org data isolation from day one.

**DailyBrief (Old Hawthorne) and MisenMore are completely separate products.**
DailyBrief has its own repo, Supabase project, and Vercel deployment and is
never touched by MisenMore work.

---

## Tech Stack

- **Frontend:** React 19 + Vite, React Router v7
- **Backend:** Supabase (Postgres + RLS + Edge Functions + Storage)
- **Auth:** Supabase Auth (email/password)
- **AI:** Google Gemini 3 Flash (chat + categorization + sales parsing), Google
  gemini-embedding-001 (RAG vector search)
- **Weather:** Google Weather API
- **Email Ingestion:** Postmark (inbound webhook → sales PDF parsing)
- **Deployment:** Vercel
- **Supabase Project Ref:** unqflkmrdfmxtggrcglc
- **Supabase URL:** https://unqflkmrdfmxtggrcglc.supabase.co
- **Supabase Org:** epbtryuelqfowetkyoot (same org as DailyBrief — accessible
  via MCP)

---

## Repositories

- **MisenMore:** https://github.com/SirCoffee1429/MisenMore
- **DailyBrief (reference only):** https://github.com/SirCoffee1429/DailyBrief

---

## Multi-Tenant Architecture

### How orgs are isolated

Every domain table has an `org_id uuid NOT NULL references organizations(id)`.
Row Level Security (RLS) is enabled on all tables. Authenticated users can only
read/write rows where `org_id` matches the claim in their JWT. Kitchen anon
users always pass an explicit `.eq('org_id', orgId)` filter resolved from the
URL slug — never rely on RLS alone for anon queries.

### Two access modes

| Mode    | Path pattern    | Auth                    | Who              |
| ------- | --------------- | ----------------------- | ---------------- |
| Kitchen | `/k/:orgSlug/*` | None (anonymous)        | Kitchen crew     |
| Office  | `/o/:orgSlug/*` | Supabase email/password | Managers, owners |

Kitchen crew bookmark or scan a QR code for their org slug URL. No username or
password ever required during service.

### Roles

- `owner` — full access, can manage members and org settings
- `manager` — full office access
- `kitchen_staff` — reserved for future explicit assignment

### Org creation

Admin-provisioned for launch: platform owner manually creates orgs and invites
managers via the Supabase dashboard. Self-serve signup is a future phase.

### Kitchen data boundary (CRITICAL)

Kitchen routes NEVER expose sales, revenue, or financial data. The anon role has
zero RLS policy on `sales_data`, `banquet_event_orders`, and `workbook_chunks`.
What kitchen CAN see: briefings, tasks, recipes, weekly features, 86'd alerts,
upcoming event names/dates, weather.

---

## App Structure

### Routes

- `/` — Landing / org entry
- `/login` — Email + password login for managers and owners
- `/k/:orgSlug` — Kitchen dashboard (anonymous)
- `/k/:orgSlug/recipes` — Recipe browser
- `/k/:orgSlug/briefings` — Briefings view
- `/k/:orgSlug/events` — Upcoming events (read-only, no financials)
- `/k/:orgSlug/chat` — AI kitchen assistant
- `/o/:orgSlug` — Office dashboard (auth required)
- `/o/:orgSlug/briefings` — Briefing list + editor
- `/o/:orgSlug/briefings/create` — Create briefings + tasks
- `/o/:orgSlug/workbooks` — Recipe workbook library
- `/o/:orgSlug/workbooks/create` — In-app form-based recipe creator (ingredient
  table + costing, no file upload)
- `/o/:orgSlug/workbooks/upload` — File upload for recipes (.pdf, .xlsx, .docx,
  .jpg/.jpeg, .png, .txt, .csv)
- `/o/:orgSlug/sales` — Sales reports and trend chart
- `/o/:orgSlug/events` — Events & banquets management + upload .pdf, .xlsx,
  .docx, .jpg/.jpeg, .png, .txt, .csv
- `/o/:orgSlug/board` — Management whiteboard
- `/o/:orgSlug/history` — Task completion history

### Key Pages

- `Dashboard.jsx` — Kitchen dashboard
- `OfficeDashboard.jsx` — Office dashboard
- `KitchenRecipes.jsx` — Recipe browser
- `WorkbookLibrary.jsx` — Office recipe management
- `WorkbookUpload.jsx` — .pdf, .xlsx, .docx, .jpg/.jpeg, .png, .txt, .csv upload
  with AI categorization
- `RecipeCreator.jsx` — In-app recipe creation with ingredient costing
- `AiChat.jsx` — Full page AI chat
- `SalesReports.jsx` — Sales report date list
- `SalesReportDetail.jsx` — Top sellers for a specific date
- `SalesTrendChart.jsx` — Category trend chart (daily/weekly/monthly,
  drill-down)
- `Briefings.jsx` — Briefing list (office)
- `BriefingEditor.jsx` — Create/edit briefings and tasks
- `History.jsx` — 30-day task completion log
- `ManagementBoardPage.jsx` — Management whiteboard
- `EventsBanquetsPage.jsx` — Banquets & BEO dashboard
- `Login.jsx` — Email/password login page

### Key Components

- `AssistantWidget.jsx` — Floating AI assistant with voice input
- `WeatherWidget.jsx` — 5-day forecast
- `SalesBriefing.jsx` — Sales summary card (office dashboard ONLY)
- `EightySixFeed.jsx` — 86'd items feed (kitchen, anon CRUD)
- `WeeklyFeatures.jsx` — Lunch/dinner feature schedule (both dashboards)
- `ManagementWhiteboard.jsx` — Manager comms board (office only)
- `KitchenLayout.jsx` / `OfficeLayout.jsx` — Shell with bottom tab nav
- `ProtectedRoute.jsx` — Auth guard for office routes
- `OrgResolver.jsx` — Resolves slug → org_id for kitchen anon context

### Key Contexts & Hooks

- `AuthContext.jsx` — Session, user, orgId, orgSlug, role, signIn, signOut.
  Reads from JWT app_metadata after custom_access_token_hook stamps the claims.
- `OrgContext.jsx` — Kitchen anon context. Resolves slug → org row on mount.
- `useAuth.js` — Hook returning AuthContext
- `useOrg.js` — Hook returning OrgContext
- `useCategories.js` — Fetches recipe_categories filtered by org_id
- `withOrg.js` — Stamps org_id onto every write payload

---

## Supabase Tables

All domain tables include `org_id uuid NOT NULL references organizations(id)`.

| Table                  | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `organizations`        | Registered orgs — id, slug, name, settings jsonb      |
| `org_members`          | Links auth users to orgs with roles                   |
| `workbooks`            | Uploaded recipe files                                 |
| `workbook_sheets`      | Parsed sheet rows as JSON arrays                      |
| `workbook_chunks`      | Text chunks with vector embeddings for RAG            |
| `recipe_categories`    | Org-managed category list                             |
| `briefings`            | Daily shift notes                                     |
| `briefing_tasks`       | Tasks attached to briefings                           |
| `sales_data`           | Parsed nightly sales (item, units, category, revenue) |
| `management_notes`     | Comms and 86'd alerts — separated by `category` field |
| `upcoming_banquets`    | Parsed upcoming event summaries                       |
| `banquet_event_orders` | Structured BEOs with food items and quantities        |
| `weekly_features`      | Scheduled lunch/dinner features                       |

---

## Edge Functions

| Function             | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `kitchen-assistant`  | RAG Q&A — filters workbook_chunks by org_id                 |
| `categorize-recipe`  | Classifies recipe into categories (no DB writes)            |
| `embed-chunks`       | Generates vector embeddings via Gemini                      |
| `get-weather`        | Proxies Google Weather API                                  |
| `process-sales-data` | Postmark webhook — parses sales PDF → sales_data            |
| `process-banquets`   | Postmark webhook — scrapes ReserveCloud → upcoming_banquets |
| `process-beo`        | Parses BEO PDFs via dashboard upload → banquet_event_orders |

All functions that write to domain tables stamp `org_id`. `match_chunks` RPC
accepts `p_org_id` parameter to scope vector search per org.

---

## RLS Policy Summary

| Table                | Authenticated     | Anon (kitchen)                                     |
| -------------------- | ----------------- | -------------------------------------------------- |
| organizations        | read own org      | SELECT (slug lookup only)                          |
| org_members          | read own          | none                                               |
| briefings            | full CRUD own org | SELECT                                             |
| briefing_tasks       | full CRUD own org | SELECT + UPDATE (completion)                       |
| workbooks            | full CRUD own org | SELECT                                             |
| workbook_sheets      | full CRUD own org | SELECT                                             |
| workbook_chunks      | full CRUD own org | none                                               |
| recipe_categories    | full CRUD own org | SELECT                                             |
| sales_data           | full CRUD own org | **none**                                           |
| management_notes     | full CRUD own org | alerts category only (SELECT/INSERT/DELETE/UPDATE) |
| upcoming_banquets    | full CRUD own org | SELECT via kitchen_upcoming_events view            |
| banquet_event_orders | full CRUD own org | **none**                                           |
| weekly_features      | full CRUD own org | SELECT                                             |

---

## RAG Pipeline

1. Recipe uploaded → chunks created → `embed-chunks` called → each chunk
   embedded via `gemini-embedding-001` → stored in `workbook_chunks.embedding`
   (vector(768)) stamped with `org_id`
2. Question asked → embedded → `match_chunks(query, count, org_id)` finds top 15
   similar chunks for this org → Gemini answers from context
3. Gemini answers from relevant context only

---

## Key Design Decisions

- Kitchen access is anonymous — org context from URL slug in OrgContext
- Sales and financial data is office-only — zero anon access paths
- EightySixFeed is the only kitchen component with write access to the DB
- JWT custom claim hook (`custom_access_token_hook`) stamps `org_id`,
  `org_slug`, `role` into `app_metadata` on every token issuance
- `withOrg(orgId, row)` must wrap every INSERT/UPDATE payload
- Weather defaults to Columbia, MO — overridable via `organizations.settings`
- Supabase service role key used only in edge functions, never in the client
- Every aspect of the application must be configured for universal use.
- Managers should be able to upload a recipe and have it categorized
  automatically
-

---

## Change Tracking

All changes are logged at:
`C:\MisenMore\Misenmore\.claude\changes_made\CHANGES.md`

---

## Session Initialization

At the start of every new session, or whenever a new model is loaded, you MUST:

1. Read `CHANGES.md` for project history
2. Read this file for project context
3. Read `IMPLEMENTATION_PLAN.md` for current build phase and status
4. Summarize the last 3 tasks completed and current implementation phase
5. use /superpowers plugin
6. Output: "Context loaded. Ready to continue from [LAST TASK TITLE]." before
   doing any work

If any of these files do not exist, flag it immediately before proceeding.

---

## Your Behavior

1. It's ok to not know something or to be wrong — always say so. Never guess or
   produce wrong code just to complete a task.
2. Ask clarifying questions before starting any significant request.
3. Offer suggestions if you see a better approach.
4. Always use available tools for accurate information. No assumptions.
5. Double check work before presenting it.
6. Refactor code when needed. Delete dead code when you see it.
7. Always put // comments above each function or block of code.
8. Never cut corners for speed, tokens, or to please.
9. Never store JWT locally.
10. **Every Supabase query must be org-scoped.** Authenticated: RLS handles it.
    Anon kitchen: always include `.eq('org_id', orgId)`. No exceptions.
11. **Every INSERT/UPDATE must use `withOrg(orgId, row)`** before sending to
    Supabase.
