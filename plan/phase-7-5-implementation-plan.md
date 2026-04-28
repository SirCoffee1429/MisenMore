# Phase 7.5 — Anon Kitchen JWT Hardening Implementation Plan

Important note for Claude: Never read this entire file from start to finish.
Read only the current task/step we are currently working on. The rest is for
context only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw-anon-key kitchen access with `signInAnonymously()` +
JWT-stamped `org_id`, rewriting all 11 kitchen anon RLS policies from
`using (true)` to
`current_role_claim() = 'kitchen_anon' AND org_id = current_org_id()`, so RLS —
not app-side `.eq()` — is the cross-tenant barrier.

**Architecture:** A one-time claim flow (`/k/:orgSlug/claim/:token`) issues an
anonymous Supabase session and links it to an org via
`kitchen_sessions`/`kitchen_claims` tables. After the claim,
`custom_access_token_hook` stamps `role: 'kitchen_anon'` and `org_id` into every
JWT refresh. Office managers generate/revoke tokens via
`/o/:orgSlug/kitchen-links` backed by a new `kitchen-link-mutations` edge
function.

**Tech Stack:** Supabase (Postgres RLS, Edge Functions, `signInAnonymously()`),
React 19, React Router v7, Supabase JS client v2.

**Spec:**
`docs/superpowers/specs/2026-04-27-phase-7-5-anon-jwt-hardening-design.md`
**Full architecture:** `memory/project_auth_decisions.md` **ACL gotcha:**
`memory/project_supabase_default_acl_gotcha.md` **Phase log:**
`.claude/changes_made/CHANGES.md`

---

## File Map

| Status | Path                                                                 | Change                                      |
| ------ | -------------------------------------------------------------------- | ------------------------------------------- |
| Create | `supabase/migrations/20260427000000_phase7_5_anon_jwt_hardening.sql` | All DB changes in one file                  |
| Create | `supabase/functions/kitchen-link-mutations/index.ts`                 | New edge function                           |
| Create | `app/src/components/KitchenUnclaimed.jsx`                            | Unclaimed wall component                    |
| Create | `app/src/pages/KitchenClaim.jsx`                                     | Claim flow page                             |
| Create | `app/src/pages/KitchenLinks.jsx`                                     | Office token management page                |
| Modify | `app/src/lib/auth/AuthContext.jsx`                                   | `readOrgClaims` kitchen_anon guard          |
| Modify | `app/src/components/ProtectedRoute.jsx`                              | `is_anonymous` check                        |
| Modify | `app/src/components/OrgResolver.jsx`                                 | Session check → KitchenUnclaimed            |
| Modify | `app/src/lib/org/OrgContext.jsx`                                     | Remove stale "no JWT claims" assumption     |
| Modify | `app/src/components/EightySixFeed.jsx`                               | Soft-delete; `is_cleared` filter            |
| Modify | `app/src/pages/EventsBanquetsPage.jsx`                               | Read `upcoming_banquets` directly           |
| Modify | `app/src/components/OfficeLayout.jsx`                                | Add Kitchen Links nav item                  |
| Modify | `app/src/App.jsx`                                                    | Add `claim/:token` + `kitchen-links` routes |

---

## Task 1: SQL Migration — Tables, Columns, Helpers, Hook Rewrite

**Files:**

- Create: `supabase/migrations/20260427000000_phase7_5_anon_jwt_hardening.sql`

This task writes and applies the entire migration. The file is sectioned with
comment dividers. Apply via MCP `apply_migration` at the end.

- [ ] **Step 1.1: Write Section 1 — New tables**

Create the file with the first section:

```sql
-- ============================================================
-- Phase 7.5: Anon kitchen JWT hardening
-- 2026-04-27
-- ============================================================

-- ============================================================
-- SECTION 1: New tables
-- ============================================================

create table public.kitchen_sessions (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  token_hash    bytea       not null,
  label         text        not null,
  created_by    uuid        references auth.users(id),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  last_claimed_at timestamptz,
  claim_count   int         not null default 0
);
create index on public.kitchen_sessions (org_id);
create unique index on public.kitchen_sessions (token_hash);

create table public.kitchen_claims (
  auth_user_id   uuid        primary key references auth.users(id) on delete cascade,
  session_id     uuid        not null references public.kitchen_sessions(id) on delete cascade,
  org_id         uuid        not null references public.organizations(id) on delete cascade,
  claimed_at     timestamptz not null default now(),
  last_claimed_at timestamptz not null default now()
);
create index on public.kitchen_claims (session_id);
create index on public.kitchen_claims (org_id);

alter table public.kitchen_sessions enable row level security;
alter table public.kitchen_claims  enable row level security;
```

- [ ] **Step 1.2: Append Section 2 — New columns on `management_notes`**

```sql
-- ============================================================
-- SECTION 2: New columns — management_notes soft-delete
-- ============================================================

alter table public.management_notes
  add column is_cleared boolean     not null default false,
  add column cleared_at timestamptz;

-- Backfill: all existing rows are not cleared
update public.management_notes set is_cleared = false;
```

- [ ] **Step 1.3: Append Section 3 — SQL helpers**

```sql
-- ============================================================
-- SECTION 3: SQL helpers
-- ============================================================

-- current_role_claim() — reads app_metadata.role from JWT.
-- Used by anon RLS policies after Phase 7.5 to require 'kitchen_anon'.
create or replace function public.current_role_claim()
returns text
language sql stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(
      current_setting('request.jwt.claims', true), ''
    )::jsonb -> 'app_metadata' ->> 'role',
    ''
  )
$$;

-- claim_kitchen_session(p_token) — SECURITY DEFINER RPC.
-- Called by anon kitchen client. Hashes token, looks up kitchen_sessions,
-- upserts kitchen_claims. Returns { org_id, org_slug, org_name } on success
-- or { error } on failure.
create or replace function public.claim_kitchen_session(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_org     record;
begin
  select ks.id, ks.org_id
    into v_session
  from public.kitchen_sessions ks
  where ks.token_hash = sha256(p_token::bytea)
    and ks.revoked_at is null;

  if not found then
    return jsonb_build_object('error', 'invalid_or_revoked_token');
  end if;

  select o.id, o.slug, o.name
    into v_org
  from public.organizations o
  where o.id = v_session.org_id;

  insert into public.kitchen_claims
    (auth_user_id, session_id, org_id, claimed_at, last_claimed_at)
  values
    (auth.uid(), v_session.id, v_session.org_id, now(), now())
  on conflict (auth_user_id) do update
    set session_id      = excluded.session_id,
        org_id          = excluded.org_id,
        last_claimed_at = now();

  update public.kitchen_sessions
    set last_claimed_at = now(),
        claim_count     = claim_count + 1
  where id = v_session.id;

  return jsonb_build_object(
    'org_id',   v_org.id::text,
    'org_slug', v_org.slug,
    'org_name', v_org.name
  );
end;
$$;

revoke execute on function public.claim_kitchen_session(text) from public;
grant  execute on function public.claim_kitchen_session(text) to anon, authenticated;

-- admin_create_kitchen_session — called by the kitchen-link-mutations edge
-- function (service role only). Generates hash server-side so the plaintext
-- token never hits the DB.
create or replace function public.admin_create_kitchen_session(
  p_org_id    uuid,
  p_token     text,
  p_label     text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.kitchen_sessions (org_id, token_hash, label, created_by)
  values (p_org_id, sha256(p_token::bytea), p_label, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_create_kitchen_session(uuid, text, text, uuid) from public, anon, authenticated;
grant  execute on function public.admin_create_kitchen_session(uuid, text, text, uuid) to service_role;
```

- [ ] **Step 1.4: Append Section 4 — Token hook rewrite**

The anon branch is added BEFORE the existing authenticated branch. The
authenticated branch is preserved byte-accurate from Phase 8.

```sql
-- ============================================================
-- SECTION 4: Token hook rewrite — add anon branch
-- ============================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
security definer
set search_path = public
as $$
declare
  claims    jsonb;
  uid       uuid;
  claim_row record;
  org_row   record;
  is_admin  boolean;
begin
  claims := event->'claims';
  uid    := (event->>'user_id')::uuid;

  -- Anonymous kitchen branch — stamp org from kitchen_claims.
  -- is_platform_admin is NOT stamped for anon users.
  -- is_anonymous lives on the claims object, not the event root.
  -- coalesce(..., false) prevents null cast failure when key is absent.
  if coalesce((claims->>'is_anonymous')::boolean, false) then
    select kc.org_id, o.slug as org_slug
      into claim_row
    from public.kitchen_claims kc
    join public.organizations o on o.id = kc.org_id
    where kc.auth_user_id = uid;

    if claim_row.org_id is not null then
      claims := jsonb_set(claims, '{app_metadata,org_id}',
                  to_jsonb(claim_row.org_id::text));
      claims := jsonb_set(claims, '{app_metadata,org_slug}',
                  to_jsonb(claim_row.org_slug));
      claims := jsonb_set(claims, '{app_metadata,role}',
                  '"kitchen_anon"');
    end if;

    return jsonb_set(event, '{claims}', claims);
  end if;

  -- Authenticated branch (byte-accurate from Phase 8).
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

  select exists(select 1 from public.platform_admins where user_id = uid)
    into is_admin;
  claims := jsonb_set(claims, '{app_metadata,is_platform_admin}',
              to_jsonb(is_admin));

  return jsonb_set(event, '{claims}', claims);
end;
$$;
```

- [ ] **Step 1.5: Append Section 5 — RLS for new tables**

```sql
-- ============================================================
-- SECTION 5: RLS for new tables
-- ============================================================

-- kitchen_sessions: office (owner/manager) reads their org's sessions.
-- Mutations go through the kitchen-link-mutations edge function (service role).
create policy "auth select own kitchen_sessions" on public.kitchen_sessions
  for select to authenticated
  using (org_id = public.current_org_id());

-- Platform admin reads all kitchen_sessions (consistent with Phase 8 posture).
create policy "platform admin all kitchen_sessions" on public.kitchen_sessions
  for select to authenticated
  using (public.is_platform_admin(auth.uid()));

-- kitchen_claims: no direct anon/authenticated access.
-- All reads/writes go through SECURITY DEFINER functions or service role.
-- (No policies = implicit deny for anon and authenticated.)
```

- [ ] **Step 1.5b: Verify actual anon policy names before writing drops**

Run via MCP `execute_sql` BEFORE writing the drop statements. The drop names in Step 1.6 were derived from Phase 7 migration source — verify they match what Postgres actually has:

```sql
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and roles @> '{anon}'
order by tablename, policyname;
```

Compare results against the `drop policy` names in Step 1.6. If any name differs (e.g. underscore vs space, different casing), update the drop statements in the migration file to match before applying. A DROP on a non-existent policy name fails the entire migration.

- [ ] **Step 1.6: Append Section 6 — Anon policy rewrites**

Drop exact policy names from Phase 7 migration, then create org-scoped
replacements.

```sql
-- ============================================================
-- SECTION 6: Anon policy rewrites
-- Drop old using(true) policies; create org+role-scoped replacements.
-- ============================================================

-- briefings
drop policy "anon select briefings" on public.briefings;
create policy "anon select briefings" on public.briefings
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id());

-- workbooks
drop policy "anon select workbooks" on public.workbooks;
create policy "anon select workbooks" on public.workbooks
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id());

-- workbook_sheets
drop policy "anon select workbook_sheets" on public.workbook_sheets;
create policy "anon select workbook_sheets" on public.workbook_sheets
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id());

-- recipe_categories
drop policy "anon select recipe_categories" on public.recipe_categories;
create policy "anon select recipe_categories" on public.recipe_categories
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id());

-- weekly_features
drop policy "anon select weekly_features" on public.weekly_features;
create policy "anon select weekly_features" on public.weekly_features
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id());

-- briefing_tasks
drop policy "anon select briefing_tasks" on public.briefing_tasks;
create policy "anon select briefing_tasks" on public.briefing_tasks
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id());

drop policy "anon update briefing_tasks" on public.briefing_tasks;
create policy "anon update briefing_tasks" on public.briefing_tasks
  for update to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id())
  with check (public.current_role_claim() = 'kitchen_anon'
              and org_id = public.current_org_id());

-- management_notes (alerts only; is_cleared = false in SELECT so kitchen
-- sees only active alerts; no DELETE — soft-delete via UPDATE only)
drop policy "anon alerts select" on public.management_notes;
create policy "anon alerts select" on public.management_notes
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id()
         and category = 'alerts'
         and is_cleared = false);

drop policy "anon alerts insert" on public.management_notes;
create policy "anon alerts insert" on public.management_notes
  for insert to anon
  with check (public.current_role_claim() = 'kitchen_anon'
              and org_id = public.current_org_id()
              and category = 'alerts');

drop policy "anon alerts update" on public.management_notes;
create policy "anon alerts update" on public.management_notes
  for update to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id()
         and category = 'alerts')
  with check (public.current_role_claim() = 'kitchen_anon'
              and org_id = public.current_org_id()
              and category = 'alerts');

drop policy "anon alerts delete" on public.management_notes;
-- No replacement: Phase 7.5 removes anon DELETE. Soft-delete via UPDATE only.

-- upcoming_banquets — new anon SELECT (replaces view access).
-- Policy added BEFORE view is dropped to avoid a zero-access window.
create policy "anon select upcoming_banquets" on public.upcoming_banquets
  for select to anon
  using (public.current_role_claim() = 'kitchen_anon'
         and org_id = public.current_org_id());

-- Drop view — anon now reads the table directly via real RLS.
drop view if exists public.kitchen_upcoming_events;
```

- [ ] **Step 1.7: Append Section 7 — Column-restrict UPDATE**

Both revoke + grant are required (see
`memory/project_supabase_default_acl_gotcha.md`):

```sql
-- ============================================================
-- SECTION 7: Column-restrict anon UPDATE
-- revoke table-level UPDATE first, then grant on specific columns.
-- The revoke is what closes the privilege gap; grant alone is not enough.
-- ============================================================

revoke update on public.briefing_tasks from anon;
grant  update (is_completed) on public.briefing_tasks to anon;

revoke update on public.management_notes from anon;
grant  update (is_cleared, cleared_at, content, pinned) on public.management_notes to anon;
```

- [ ] **Step 1.8: Apply migration via MCP**

Call `mcp__claude_ai_Supabase__apply_migration` with:

- `project_id`: `unqflkmrdfmxtggrcglc`
- `name`: `phase7_5_anon_jwt_hardening`
- `query`: full content of the migration file

Expected: success response. If it fails, read the error and fix before
proceeding.

- [ ] **Step 1.9: Verify migration via MCP**

Run the following SQL via `execute_sql`:

```sql
-- New tables exist
select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('kitchen_sessions', 'kitchen_claims');

-- New columns on management_notes
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'management_notes'
  and column_name in ('is_cleared', 'cleared_at');

-- Helper functions exist
select proname from pg_proc
where proname in ('current_role_claim', 'claim_kitchen_session',
                  'admin_create_kitchen_session');

-- View dropped
select count(*) from pg_views
where schemaname = 'public' and viewname = 'kitchen_upcoming_events';
-- Expected: 0

-- Anon policy count on briefings (should be 1 scoped policy, not using(true))
select policyname, qual from pg_policies
where schemaname = 'public'
  and tablename = 'briefings'
  and roles @> '{anon}';
-- Expected: policy with 'kitchen_anon' in qual

-- upcoming_banquets has anon SELECT policy
select policyname from pg_policies
where schemaname = 'public'
  and tablename = 'upcoming_banquets'
  and roles @> '{anon}';
```

Expected results documented above in comments. Fix and re-apply if any check
fails.

---

## Task 2: Edge Function — `kitchen-link-mutations`

**Files:**

- Create: `supabase/functions/kitchen-link-mutations/index.ts`

- [ ] **Step 2.1: Create the edge function file**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";

  // Use auth.getUser() to verify JWT signature via Supabase Auth.
  // Manual JWT decode without signature verification is unsafe — an attacker
  // with a valid anon key can forge role/org_id claims. auth.getUser() rejects
  // any token whose signature doesn't match the project secret.
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "unauthorized" }, 401);

  const meta = user.app_metadata ?? {};

  // 401 = not authenticated. 403 = authenticated but wrong role.
  // kitchen_anon is redundant here — it fails the owner/manager check naturally.
  // !meta.org_id is a defensive guard; a claimed user always has org_id from the hook.
  if (!meta.org_id) return jsonResponse({ error: "unauthorized" }, 401);
  if (meta.role !== "owner" && meta.role !== "manager") {
    return jsonResponse({ error: "forbidden" }, 403);
  }

  const orgId: string = meta.org_id;
  const userId: string = user.id;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ----------------------------------------------------------------
  // list_sessions — returns sessions for this org with active_claims
  // ----------------------------------------------------------------
  if (action === "list_sessions") {
    const { data: sessions, error } = await supabaseAdmin
      .from("kitchen_sessions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return jsonResponse({ error: error.message }, 500);

    // TODO Phase 9: replace with a kitchen_sessions_with_active_claims view
    // to avoid fetching every claim row for counting. Fine for v1 data volumes.
    const sessionIds = (sessions ?? []).map((s) => s.id);
    let claimCounts: Record<string, number> = {};
    if (sessionIds.length > 0) {
      const { data: claims } = await supabaseAdmin
        .from("kitchen_claims")
        .select("session_id")
        .in("session_id", sessionIds);
      (claims ?? []).forEach((c) => {
        claimCounts[c.session_id] = (claimCounts[c.session_id] ?? 0) + 1;
      });
    }

    return jsonResponse({
      sessions: (sessions ?? []).map((s) => ({
        ...s,
        active_claims: claimCounts[s.id] ?? 0,
      })),
    });
  }

  // ----------------------------------------------------------------
  // create_session — generates token server-side, stores hash, returns
  // plaintext ONCE. Client must show it immediately; it is not recoverable.
  // ----------------------------------------------------------------
  if (action === "create_session") {
    const { label } = body;
    if (!label?.trim()) return jsonResponse({ error: "label required" }, 400);

    // 32 random bytes → base64url ~43 chars
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const { data: sessionId, error } = await supabaseAdmin.rpc(
      "admin_create_kitchen_session",
      {
        p_org_id: orgId,
        p_token: token,
        p_label: label.trim(),
        p_created_by: userId,
      },
    );
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ session_id: sessionId, token });
  }

  // ----------------------------------------------------------------
  // revoke_session — sets revoked_at and deletes linked kitchen_claims.
  // Existing JWT drift ~1hr applies (stateless JWT cost; acceptable).
  // ----------------------------------------------------------------
  if (action === "revoke_session") {
    const { session_id } = body;
    if (!session_id) return jsonResponse({ error: "session_id required" }, 400);

    // Verify session belongs to caller's org
    const { data: session, error: fetchErr } = await supabaseAdmin
      .from("kitchen_sessions")
      .select("org_id")
      .eq("id", session_id)
      .single();
    if (fetchErr || !session) return jsonResponse({ error: "not found" }, 404);
    if (session.org_id !== orgId) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    await supabaseAdmin
      .from("kitchen_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", session_id);

    await supabaseAdmin
      .from("kitchen_claims")
      .delete()
      .eq("session_id", session_id);

    return jsonResponse({ ok: true });
  }

  // ----------------------------------------------------------------
  // update_label — updates the human label on a session
  // ----------------------------------------------------------------
  if (action === "update_label") {
    const { session_id, label } = body;
    if (!session_id || !label?.trim()) {
      return jsonResponse({ error: "session_id and label required" }, 400);
    }

    const { data: session, error: fetchErr } = await supabaseAdmin
      .from("kitchen_sessions")
      .select("org_id")
      .eq("id", session_id)
      .single();
    if (fetchErr || !session) return jsonResponse({ error: "not found" }, 404);
    if (session.org_id !== orgId) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    const { error } = await supabaseAdmin
      .from("kitchen_sessions")
      .update({ label: label.trim() })
      .eq("id", session_id);
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "unknown action" }, 400);
});
```

- [ ] **Step 2.2: Deploy the edge function**

Run via Bash:

```bash
supabase functions deploy kitchen-link-mutations --project-ref unqflkmrdfmxtggrcglc
```

Expected output: `Deployed Edge Function kitchen-link-mutations`

---

## Task 3: `KitchenUnclaimed.jsx`

**Files:**

- Create: `app/src/components/KitchenUnclaimed.jsx`

Shared by OrgGate (unclaimed session) and KitchenClaim (error states). Static
component; no navigation logic.

- [ ] **Step 3.1: Create the component**

```jsx
export default function KitchenUnclaimed({ orgSlug }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <i
        className="fa-solid fa-link-slash"
        style={{
          fontSize: "3rem",
          color: "var(--text-secondary)",
          marginBottom: "1.5rem",
        }}
      />
      <h2 style={{ marginBottom: "0.75rem" }}>Device not linked</h2>
      <p style={{ color: "var(--text-secondary)", maxWidth: 360 }}>
        This device isn't connected to
        {orgSlug ? ` the ${orgSlug} kitchen` : " a kitchen"}. Scan the kitchen
        QR code or ask your manager for the setup link.
      </p>
    </div>
  );
}
```

---

## Task 4: `OrgResolver.jsx` — Session Check

**Files:**

- Modify: `app/src/components/OrgResolver.jsx`

OrgGate gains a Supabase auth state listener. When session is null OR session is
anonymous with no `kitchen_anon` role, it renders `KitchenUnclaimed` instead of
the kitchen app. Authenticated non-anonymous users (office managers navigating
to a kitchen URL) pass through — that's a routing concern handled elsewhere.

- [ ] **Step 4.1: Rewrite OrgResolver.jsx**

```jsx
import { useEffect, useState } from "react";
import { OrgProvider } from "../lib/org/OrgContext.jsx";
import { useOrg } from "../lib/org/useOrg.js";
import { supabase } from "../lib/supabase.js";
import KitchenUnclaimed from "./KitchenUnclaimed.jsx";

function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(
      padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="),
    );
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

function OrgGate({ children }) {
  const { loading: orgLoading, error, orgSlug } = useOrg();
  const [authState, setAuthState] = useState({
    loading: true,
    isKitchenAnon: false,
    noSession: false,
  });

  useEffect(() => {
    function evaluate(session) {
      if (!session) {
        setAuthState({ loading: false, isKitchenAnon: false, noSession: true });
        return;
      }
      // Authenticated non-anonymous users pass through (office user on kitchen URL)
      if (!session.user?.is_anonymous) {
        setAuthState({ loading: false, isKitchenAnon: true, noSession: false });
        return;
      }
      // Anonymous session — check if claim flow completed (role = 'kitchen_anon')
      const claims = decodeJwtPayload(session.access_token);
      const role = claims?.app_metadata?.role;
      setAuthState({
        loading: false,
        isKitchenAnon: role === "kitchen_anon",
        noSession: false,
      });
    }

    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      evaluate(session)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (orgLoading || authState.loading) {
    return <div className="loading-screen">Loading…</div>;
  }

  // Org slug errors (not found, missing) — show org-level message
  if (error === "not_found" || error === "missing_slug") {
    return (
      <div style={{ padding: "2rem", color: "#fff", textAlign: "center" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>Organization not found</h2>
        <p style={{ color: "#9ca3af" }}>
          The link you followed doesn't match any known organization.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", color: "#fff", textAlign: "center" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
        <p style={{ color: "#9ca3af" }}>{error}</p>
      </div>
    );
  }

  // Unclaimed: no session, or anonymous session without kitchen_anon claim
  if (authState.noSession || !authState.isKitchenAnon) {
    return <KitchenUnclaimed orgSlug={orgSlug} />;
  }

  return children;
}

export default function OrgResolver({ children }) {
  return (
    <OrgProvider>
      <OrgGate>{children}</OrgGate>
    </OrgProvider>
  );
}
```

---

## Task 5: `AuthContext.jsx` + `ProtectedRoute.jsx` Guards

**Files:**

- Modify: `app/src/lib/auth/AuthContext.jsx`
- Modify: `app/src/components/ProtectedRoute.jsx`

- [ ] **Step 5.1: Add `kitchen_anon` guard to `readOrgClaims` in
      AuthContext.jsx**

Find and replace the `readOrgClaims` function (lines 33–42 of current file):

```jsx
export function readOrgClaims(session) {
  const claims = decodeJwtPayload(session?.access_token);
  const meta = claims?.app_metadata ?? {};

  // Anonymous kitchen sessions must never be treated as office sessions.
  // Return all nulls so ProtectedRoute and office consumers see "no session."
  if (meta.role === "kitchen_anon") {
    return { orgId: null, orgSlug: null, role: null, isPlatformAdmin: false };
  }

  return {
    orgId: meta.org_id ?? null,
    orgSlug: meta.org_slug ?? null,
    role: meta.role ?? null,
    isPlatformAdmin: meta.is_platform_admin === true,
  };
}
```

- [ ] **Step 5.2: Add `is_anonymous` check to ProtectedRoute.jsx**

Find the `if (!session)` block and add the anonymous check immediately after it.
Full updated function:

```jsx
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth/useAuth.js";

export default function ProtectedRoute({ children }) {
  const { session, orgSlug, loading } = useAuth();
  const { orgSlug: urlSlug } = useParams();

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Block anonymous kitchen sessions from reaching office routes.
  // session.user.is_anonymous is the canonical Supabase Auth flag.
  if (session.user?.is_anonymous) {
    return <Navigate to="/login" replace />;
  }

  if (!orgSlug) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Account not provisioned</h2>
        <p>
          Your account exists but isn't linked to an organization yet. Contact
          your administrator.
        </p>
      </div>
    );
  }

  if (urlSlug && urlSlug !== orgSlug) {
    return <Navigate to={`/o/${orgSlug}`} replace />;
  }

  return children;
}
```

---

## Task 6: `KitchenClaim.jsx` + App.jsx Routes

**Files:**

- Create: `app/src/pages/KitchenClaim.jsx`
- Modify: `app/src/App.jsx`

`KitchenClaim` is mounted OUTSIDE OrgResolver (it must run without a valid
session). It does its own org name lookup from the organizations table (anon
SELECT on organizations has been allowed since Phase 4 migration).

- [ ] **Step 6.1: Create KitchenClaim.jsx**

```jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import KitchenUnclaimed from "../components/KitchenUnclaimed.jsx";

export default function KitchenClaim() {
  const { orgSlug, token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("claiming"); // 'claiming' | 'success' | 'error'
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    async function doClaim() {
      try {
        // 1. Ensure anonymous session exists
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { error: anonErr } = await supabase.auth.signInAnonymously();
          if (anonErr) throw anonErr;
        }

        // 2. Claim the kitchen session via SECURITY DEFINER RPC
        const { data, error: claimErr } = await supabase.rpc(
          "claim_kitchen_session",
          {
            p_token: token,
          },
        );
        if (claimErr) throw claimErr;
        if (data?.error) throw new Error(data.error);

        // 3. Refresh JWT so hook re-fires and stamps kitchen_anon claims
        await supabase.auth.refreshSession();

        setOrgName(data.org_name || orgSlug);
        setStatus("success");

        // 4. Brief display then redirect to kitchen
        setTimeout(() => navigate(`/k/${orgSlug}`, { replace: true }), 1500);
      } catch {
        setStatus("error");
      }
    }

    doClaim();
  }, [orgSlug, token, navigate]);

  if (status === "claiming") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}
      >
        <i
          className="fa-solid fa-spinner fa-spin"
          style={{ fontSize: "2rem", marginBottom: "1rem" }}
        />
        <p>Linking this device…</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}
      >
        <i
          className="fa-solid fa-circle-check"
          style={{ fontSize: "3rem", color: "#4ade80", marginBottom: "1rem" }}
        />
        <h2>Linked to {orgName}</h2>
      </div>
    );
  }

  // error: token not found, revoked, or network failure
  return <KitchenUnclaimed orgSlug={orgSlug} />;
}
```

- [ ] **Step 6.2: Update App.jsx — add claim route and kitchen-links route**

Add the KitchenClaim import at the top of the imports block:

```jsx
import KitchenClaim from "./pages/KitchenClaim.jsx";
import KitchenLinks from "./pages/KitchenLinks.jsx";
```

Add the claim route as a top-level route (BEFORE the `/k/:orgSlug` block so
React Router matches it with specificity). Add kitchen-links inside the office
block:

```jsx
{/* Claim route — top-level, outside OrgResolver. No session required. */}
<Route path="/k/:orgSlug/claim/:token" element={<KitchenClaim />} />;

{/* Kitchen routes — anonymous, org resolved from URL slug */}
<Route
  path="/k/:orgSlug"
  element={
    <OrgResolver>
      <KitchenLayout />
    </OrgResolver>
  }
>
  {/* ... existing children unchanged ... */}
</Route>;

{/* Office routes */}
<Route
  path="/o/:orgSlug"
  element={
    <ProtectedRoute>
      <OfficeLayout />
    </ProtectedRoute>
  }
>
  {/* ... existing children unchanged ... */}
  <Route path="kitchen-links" element={<KitchenLinks />} />
</Route>;
```

---

## Task 7: `KitchenLinks.jsx`

**Files:**

- Create: `app/src/pages/KitchenLinks.jsx`

Office page for managing kitchen link tokens. Follows AdminPanel.jsx pattern:
state + async mutations via edge function.

Note on "Copy link": the plaintext token is shown ONCE in the generation modal.
Per-row UI has Revoke only — the token hash cannot be reversed. Lost token =
revoke + reissue.

- [ ] **Step 7.1: Create KitchenLinks.jsx**

```jsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth/useAuth.js";

const BASE_URL = window.location.origin;

export default function KitchenLinks() {
  const { orgSlug, session } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Generate modal state
  const [showModal, setShowModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null); // { token, session_id, url }

  // Edit label state — { id, value } or null
  const [editingLabel, setEditingLabel] = useState(null);

  const callMutation = useCallback(async (action, body = {}) => {
    const token = session?.access_token;
    const { data, error: invokeErr } = await supabase.functions.invoke(
      "kitchen-link-mutations",
      {
        body: { action, ...body },
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (invokeErr) throw new Error(invokeErr.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, [session]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callMutation("list_sessions");
      setSessions(data?.sessions ?? []);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [callMutation]);

  useEffect(() => {
    if (session) loadSessions();
  }, [session, loadSessions]);

  async function handleGenerate(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await callMutation("create_session", {
        label: newLabel.trim(),
      });
      const claimUrl = `${BASE_URL}/k/${orgSlug}/claim/${data.token}`;
      setGeneratedLink({
        token: data.token,
        session_id: data.session_id,
        url: claimUrl,
      });
      setNewLabel("");
      await loadSessions();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke(sessionId) {
    if (
      !confirm(
        "Revoke this link? Any device using it will be disconnected on next JWT refresh (~1 hour).",
      )
    ) return;
    setError(null);
    try {
      await callMutation("revoke_session", { session_id: sessionId });
      await loadSessions();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleSaveLabel(sessionId) {
    if (!editingLabel || editingLabel.id !== sessionId) return;
    setError(null);
    try {
      await callMutation("update_label", {
        session_id: sessionId,
        label: editingLabel.value,
      });
      setEditingLabel(null);
      await loadSessions();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  function formatDate(ts) {
    if (!ts) return "Never";
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="header-title">
            <i
              className="fa-solid fa-link"
              style={{ color: "#60a5fa", marginRight: 8 }}
            />
            Kitchen Links
          </h1>
          <p className="header-date">Manage kitchen device access tokens</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setShowModal(true);
              setGeneratedLink(null);
            }}
          >
            <i className="fa-solid fa-plus" /> New Link
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" style={{ color: "#f87171", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Generation modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              padding: 32,
              width: "100%",
              maxWidth: 480,
              border: "1px solid var(--border-color)",
            }}
          >
            {generatedLink
              ? (
                <>
                  <h2 style={{ marginTop: 0 }}>Link generated</h2>
                  <p style={{ color: "#f87171", fontWeight: 600 }}>
                    <i className="fa-solid fa-triangle-exclamation" />{" "}
                    This link won't be shown again. Copy it now.
                  </p>
                  <div
                    style={{
                      background: "var(--bg-primary)",
                      borderRadius: "var(--radius-sm)",
                      padding: 12,
                      wordBreak: "break-all",
                      fontSize: "0.85rem",
                      marginBottom: 16,
                    }}
                  >
                    {generatedLink.url}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        navigator.clipboard.writeText(generatedLink.url)}
                    >
                      <i className="fa-solid fa-copy" /> Copy
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setShowModal(false);
                        setGeneratedLink(null);
                      }}
                    >
                      Done
                    </button>
                  </div>
                </>
              )
              : (
                <>
                  <h2 style={{ marginTop: 0 }}>New kitchen link</h2>
                  <form onSubmit={handleGenerate}>
                    <input
                      required
                      className="wb-text-input"
                      placeholder="Label (e.g. Main kitchen tablet)"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      style={{ marginBottom: 16, width: "100%" }}
                      autoFocus
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={generating || !newLabel.trim()}
                      >
                        {generating
                          ? <i className="fa-solid fa-spinner fa-spin" />
                          : "Generate"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowModal(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              )}
          </div>
        </div>
      )}

      {/* Sessions list */}
      <div className="card" style={{ marginTop: 24 }}>
        {loading
          ? (
            <div
              className="shimmer"
              style={{ height: 200, borderRadius: "var(--radius-md)" }}
            />
          )
          : sessions.length === 0
          ? (
            <div className="empty-task-list">
              No kitchen links yet. Create one to let kitchen devices connect.
            </div>
          )
          : (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Created</th>
                    <th>Last Claimed</th>
                    <th>Status</th>
                    <th>Claims</th>
                    <th>Active Devices</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const isRevoked = !!s.revoked_at;
                    const isEditing = editingLabel?.id === s.id;
                    return (
                      <tr key={s.id} style={{ opacity: isRevoked ? 0.5 : 1 }}>
                        <td>
                          {isEditing
                            ? (
                              <div style={{ display: "flex", gap: 4 }}>
                                <input
                                  className="wb-text-input"
                                  value={editingLabel.value}
                                  onChange={(e) =>
                                    setEditingLabel({
                                      id: s.id,
                                      value: e.target.value,
                                    })}
                                  style={{ fontSize: "0.9rem" }}
                                />
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => handleSaveLabel(s.id)}
                                >
                                  Save
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setEditingLabel(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            )
                            : (
                              <span
                                style={{
                                  cursor: isRevoked ? "default" : "pointer",
                                }}
                                onClick={() =>
                                  !isRevoked &&
                                  setEditingLabel({ id: s.id, value: s.label })}
                                title={isRevoked ? undefined : "Click to edit"}
                              >
                                {s.label}
                              </span>
                            )}
                        </td>
                        <td
                          style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}
                        >
                          {formatDate(s.created_at)}
                        </td>
                        <td
                          style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}
                        >
                          {formatDate(s.last_claimed_at)}
                        </td>
                        <td>
                          {isRevoked
                            ? <span style={{ color: "#f87171" }}>Revoked</span>
                            : <span style={{ color: "#4ade80" }}>Active</span>}
                        </td>
                        <td>{s.claim_count}</td>
                        <td>{s.active_claims}</td>
                        <td>
                          {!isRevoked && (
                            <button
                              className="wb-act-btn wb-act-delete"
                              onClick={() => handleRevoke(s.id)}
                              title="Revoke this link"
                            >
                              <i className="fa-solid fa-ban" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
```

---

## Task 8: `OfficeLayout.jsx` — Add Kitchen Links Nav

**Files:**

- Modify: `app/src/components/OfficeLayout.jsx`

Add a NavLink for Kitchen Links after the existing Board nav item.

- [ ] **Step 8.1: Add Kitchen Links NavLink in OfficeLayout.jsx**

Find the Board NavLink:

```jsx
<NavLink
  to={`/o/${orgSlug}/board`}
  className={({ isActive }) => `office-v2-nav-link ${isActive ? "active" : ""}`}
>
  <i className="fa-solid fa-chalkboard office-v2-nav-icon" />
  <span style={{ marginLeft: "0.75rem" }}>Board</span>
</NavLink>;
```

Add immediately after it:

```jsx
<NavLink
  to={`/o/${orgSlug}/kitchen-links`}
  className={({ isActive }) => `office-v2-nav-link ${isActive ? "active" : ""}`}
>
  <i className="fa-solid fa-link office-v2-nav-icon" />
  <span style={{ marginLeft: "0.75rem" }}>Kitchen Links</span>
</NavLink>;
```

---

## Task 9: `EightySixFeed.jsx` — Soft-Delete

**Files:**

- Modify: `app/src/components/EightySixFeed.jsx`

Replace hard DELETE with soft-delete via UPDATE. Add `is_cleared = false` filter
to SELECT.

- [ ] **Step 9.1: Update loadNotes to filter cleared alerts**

Find the SELECT query in `loadNotes`:

```js
.eq('category', 'alerts')
```

Replace with:

```js
.eq('category', 'alerts')
.eq('is_cleared', false)
```

- [ ] **Step 9.2: Replace handleDelete with soft-delete**

Replace the entire `handleDelete` function:

```js
// Before
async function handleDelete(id) {
  if (!orgId) return;
  await supabase.from("management_notes").delete().eq("id", id).eq(
    "org_id",
    orgId,
  );
  setNotes((prev) => prev.filter((n) => n.id !== id));
}
```

With:

```js
async function handleDelete(id) {
  if (!orgId) return;
  await supabase
    .from("management_notes")
    .update({ is_cleared: true, cleared_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);
  setNotes((prev) => prev.filter((n) => n.id !== id));
}
```

---

## Task 10: `EventsBanquetsPage.jsx` + `OrgContext.jsx` Updates

**Files:**

- Modify: `app/src/pages/EventsBanquetsPage.jsx`
- Modify: `app/src/lib/org/OrgContext.jsx`

- [ ] **Step 10.1: Update loadBanquets to read `upcoming_banquets` directly**

Find the `loadBanquets` function. Replace the branching source:

```js
// Before
const source = readOnly ? "kitchen_upcoming_events" : "upcoming_banquets";
const { data } = await supabase
  .from(source);
```

With:

```js
// After — both paths read upcoming_banquets; anon has RLS policy now
const { data } = await supabase
  .from("upcoming_banquets");
```

- [ ] **Step 10.2: Update OrgContext.jsx comment**

Find the file-level comment in OrgContext.jsx (lines 7–10):

```js
// OrgContext — anon-safe slug resolution for kitchen routes. Reads
// :orgSlug from the URL, looks up the matching organizations row, and
// exposes the resolved org_id so kitchen queries can pass
// .eq('org_id', orgId) without trusting RLS alone (anon kitchen has no
// JWT claims to scope queries server-side).
```

Replace with:

```js
// OrgContext — slug resolution for kitchen routes. Reads :orgSlug from
// the URL, looks up the matching organizations row, and exposes orgId
// for components that need it (e.g. EightySixFeed). After Phase 7.5,
// anon kitchen JWTs carry org_id claims and RLS enforces org scoping
// server-side. App-side .eq('org_id', orgId) is retained as
// defense-in-depth.
```

---

## Task 11: Build Verification

- [ ] **Step 11.1: Run Vite build**

```bash
cd app && npm run build
```

Expected: clean compile, 0 errors. If TypeScript or import errors appear, fix
them before proceeding.

---

## Task 12: Cross-Tenant Attack Tests (Pre-Commit Verification)

**Prerequisite:** Reseed `test-org-b` with deterministic UUID
`11111111-1111-1111-1111-111111111111`.

- [ ] **Step 12.1: Reseed test-org-b via MCP execute_sql**

```sql
insert into public.organizations (id, slug, name)
values (
  '11111111-1111-1111-1111-111111111111',
  'test-org-b',
  'Test Org B'
) on conflict (id) do nothing;

-- Seed one briefing row for org B so we can test cross-tenant SELECT
insert into public.briefings (org_id, title, content)
values (
  '11111111-1111-1111-1111-111111111111',
  'ORG_B briefing — should never be visible to org A anon',
  'Cross-tenant test content'
) on conflict do nothing;
```

- [ ] **Step 12.2: Run attack tests via MCP execute_sql**

Each test uses `set local role anon` + `set_config` to simulate a JWT carrying
test-org's org_id as a kitchen_anon user, then tries to access test-org-b's
data.

**Test a — claimed anon can read own org's briefings:**

```sql
set local role anon;
select set_config('request.jwt.claims',
  '{"app_metadata":{"org_id":"cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e","role":"kitchen_anon"}}',
  true);
select count(*) from public.briefings where org_id = 'cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e';
```

Expected: count ≥ 0 (rows returned — RLS allows own org).

**Test b — cross-tenant SELECT blocked even with crafted `.eq()`:**

```sql
set local role anon;
select set_config('request.jwt.claims',
  '{"app_metadata":{"org_id":"cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e","role":"kitchen_anon"}}',
  true);
select count(*) from public.briefings where org_id = '11111111-1111-1111-1111-111111111111';
```

Expected: **0** — RLS reads `current_org_id()` from JWT, not the filter value.

**Test c — unclaimed anon (no role claim) gets nothing:**

```sql
set local role anon;
select set_config('request.jwt.claims', '{"app_metadata":{}}', true);
select count(*) from public.briefings where org_id = 'cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e';
```

Expected: **0** — `current_role_claim()` returns '' ≠ 'kitchen_anon'.

**Test d — anon cannot read sales_data (implicit deny):**

```sql
set local role anon;
select set_config('request.jwt.claims',
  '{"app_metadata":{"org_id":"cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e","role":"kitchen_anon"}}',
  true);
select count(*) from public.sales_data where org_id = 'cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e';
```

Expected: **0** (no anon policy on sales_data).

**Test e — anon cannot INSERT management_notes with category = 'comms':**

```sql
set local role anon;
select set_config('request.jwt.claims',
  '{"app_metadata":{"org_id":"cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e","role":"kitchen_anon"}}',
  true);
insert into public.management_notes (org_id, content, author, category)
values ('cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e', 'attack', 'attacker', 'comms');
```

Expected: **42501 permission denied** (WITH CHECK rejects category ≠ 'alerts').

**Test f — anon cannot UPDATE briefing_tasks columns beyond is_completed:**

```sql
set local role anon;
select set_config('request.jwt.claims',
  '{"app_metadata":{"org_id":"cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e","role":"kitchen_anon"}}',
  true);
-- Attempt to update the `title` column (not in grant list)
update public.briefing_tasks set title = 'hacked'
where org_id = 'cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e'
limit 1;
```

Expected: **42501 permission denied** (column-level grant excludes `title`).

**Test g — anon cannot hard-DELETE management_notes:**

```sql
set local role anon;
select set_config('request.jwt.claims',
  '{"app_metadata":{"org_id":"cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e","role":"kitchen_anon"}}',
  true);
delete from public.management_notes
where org_id = 'cbc0aaeb-b1b3-489e-849d-0d0e1fe09b9e'
  and category = 'alerts';
```

Expected: **0 rows deleted** or **42501** — no DELETE policy for anon.

- [ ] **Step 12.3: Tear down test-org-b**

```sql
delete from public.organizations where id = '11111111-1111-1111-1111-111111111111';
-- Cascade deletes briefings and any other seeded rows
```

- [ ] **Step 12.4: Verify test-org state is clean**

```sql
select count(*) from public.organizations where slug in ('test-org-b');
```

Expected: **0**

---

## Task 13: CHANGES.md Entry, prompt.md, Commit

**Files:**

- Modify: `.claude/changes_made/CHANGES.md`
- Create/Overwrite: `prompt.md`

- [ ] **Step 13.1: Write CHANGES.md entry**

Prepend at the top of `.claude/changes_made/CHANGES.md`. Use this structure:

```
### 2026-04-27 — Phase 7.5: Anon Kitchen JWT Hardening

**Type:** `feat`
**Commit:** `<sha>` (<insertions>, <deletions>, <N> files)
**Summary:** [2–3 sentences: what changed, why it existed, what it closes.
Mention: replaced using(true) anon RLS with kitchen_anon role claim policies;
added kitchen_sessions + kitchen_claims for token-based device linking;
Phase 8 admin panel unblocked but first real org provisioning now safe.]

**New files:**
- `supabase/migrations/20260427000000_phase7_5_anon_jwt_hardening.sql` — [describe each section]
- `supabase/functions/kitchen-link-mutations/index.ts` — [describe auth gate + 4 actions]
- `app/src/pages/KitchenClaim.jsx` — [describe claim flow]
- `app/src/pages/KitchenLinks.jsx` — [describe office token management]
- `app/src/components/KitchenUnclaimed.jsx` — [describe wall component + reuse]

**Updated files:**
- `app/src/lib/auth/AuthContext.jsx` — [readOrgClaims kitchen_anon guard]
- `app/src/components/ProtectedRoute.jsx` — [is_anonymous check]
- `app/src/components/OrgResolver.jsx` — [session check → KitchenUnclaimed]
- `app/src/lib/org/OrgContext.jsx` — [stale comment removed]
- `app/src/components/EightySixFeed.jsx` — [soft-delete via is_cleared]
- `app/src/pages/EventsBanquetsPage.jsx` — [reads upcoming_banquets directly]
- `app/src/components/OfficeLayout.jsx` — [Kitchen Links nav item]
- `app/src/App.jsx` — [new claim + kitchen-links routes]
- `CLAUDE.md` — [rule 10, edge function list, isolation paragraph, removed Phase 7.5 Will Change section]

**Verification:**
- `mcp.apply_migration` succeeded. Verified: new tables exist, columns added,
  view dropped, 11 policy rewrites confirmed via pg_policies.
- Cross-tenant attack tests a–g: all pass. [List each test and result.]
- `vite build`: clean, 0 errors.

**Followups (not Phase 7.5 scope):**
- **Captcha on anon sign-in** — Cloudflare Turnstile before first real customer org.
  Required because signInAnonymously() creates real auth.users rows; bot loops
  fill the table indefinitely without it. Phase 9.
- **`auth_leaked_password_protection` WARN** — same phase as captcha.
- **Per-device kitchen auth** — one anon user per device vs current shared-user
  model. Deferred until per-device audit is an actual requirement.
- **Cleared alerts history view** — is_cleared data is retained; office UI to
  see cleared history is a future phase.
- **Anon user cleanup job** — orphaned signInAnonymously() rows that never claimed
  a session. Periodic delete job, defer to Phase 9+.

**Next:** Phase 9 — captcha (Cloudflare Turnstile) + `auth_leaked_password_protection`.
```

- [ ] **Step 13.2: Update IMPLEMENTATION_PLAN.md**

Mark Phase 7.5 complete:

```markdown
- [x] **Phase 7.5 — Anon kitchen JWT hardening** (shipped 2026-04-27)
```

Update the Phase 7.5 section status from "next commit" to "complete, see
CHANGES.md."

- [ ] **Step 13.3: Rewrite prompt.md**

Overwrite `prompt.md` in repo root as a session-handoff doc. Format: "Starting a
new session on MisenMore at [date]…", then: init protocol reminder, where we are
(Phase 7.5 complete, next is Phase 9), what was built in this session, gotchas
(dev sign-out wipes kitchen session, 1hr JWT drift on revoke), test scaffolding
state (test-org only, test-org-b torn down), open decisions (captcha before
first real customer org).

- [ ] **Step 13.4: Update memory files**

Update `memory/project_auth_decisions.md` — retag all `(PHASE 7.5 — PLANNED)`
sections to `(LIVE since Phase 7.5)`.

Update `memory/project_context.md` — change current phase from "Phase 8 closed"
to "Phase 7.5 complete (2026-04-27)."

- [ ] **Step 13.5: Update CLAUDE.md — "Phase 7.5 Will Change" section**

The CLAUDE.md file has a section ("## Phase 7.5 Will Change") with three items
that must be updated now that Phase 7.5 has shipped. Make these three changes:

1. **Rule 10** (anon kitchen queries) — change from:
   > Authenticated: RLS enforces server-side. Anon kitchen: always
   > `.eq('org_id', orgId)` — RLS is currently `using (true)` for anon...

   To reflect that anon RLS is now the barrier, not app-side `.eq()`. The
   `.eq()` remains as defense-in-depth only.

2. **Edge function list** — add `kitchen-link-mutations` (office-managed kitchen
   link tokens, same-org owner/manager auth gate) to the edge functions
   enumeration.

3. **Isolation paragraph** — update the multi-tenant isolation section to
   reflect that anon kitchen JWT now carries `org_id`; Phase 7.5 shipped
   `kitchen_anon` role claim and
   `current_role_claim() = 'kitchen_anon' AND org_id = current_org_id()`
   policies. Remove the "Known gap. Phase 7.5..." note.

After these edits, delete the "## Phase 7.5 Will Change" section from CLAUDE.md
entirely — it is no longer forward-looking.

- [ ] **Step 13.6: Single commit**

Stage all changed and new files explicitly (do not use `git add -A` blindly —
verify `git status` first to confirm nothing unexpected is staged):

```bash
git add -A
git commit -m "feat: Phase 7.5 — anon kitchen JWT hardening

- kitchen_sessions + kitchen_claims tables
- claim_kitchen_session() SECURITY DEFINER RPC
- Token hook: anonymous branch stamps kitchen_anon role + org_id
- 11 anon RLS policies rewritten: using(true) -> role+org scoped
- Column-restrict UPDATE on briefing_tasks + management_notes
- Anon SELECT policy on upcoming_banquets; drop kitchen_upcoming_events view
- kitchen-link-mutations edge function (create/revoke/list/update_label)
- KitchenClaim, KitchenLinks, KitchenUnclaimed pages
- AuthContext: readOrgClaims guards kitchen_anon sessions
- ProtectedRoute: blocks anonymous Supabase sessions
- EightySixFeed: soft-delete via is_cleared
- EventsBanquetsPage: reads upcoming_banquets directly
- Cross-tenant attack tests a-g: all pass"
```
