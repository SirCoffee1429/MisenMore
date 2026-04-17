-- Phase 2 Migration 1 — Extensions + core multi-tenant tables.
-- Establishes pgcrypto (for gen_random_uuid) and pgvector (for RAG embeddings),
-- plus the two tables every other domain table will reference via org_id.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Core org table. Every domain row in MisenMore is owned by exactly one org.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Links Supabase auth users to orgs with roles.
-- The custom_access_token_hook (Phase 3) reads this table to stamp JWT claims.
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

-- RLS on from day one. Anon slug lookup policy comes in Phase 7.
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
