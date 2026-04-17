-- Phase 3 Migration 1 — Harden search_path on Phase 2 helper functions.
-- Supabase advisor flagged current_org_id() and match_chunks() as having a
-- mutable search_path. Pinning the path closes a (low-risk here, but free to
-- fix) shadowing vector and silences the advisor before Phase 7 RLS policies
-- start calling current_org_id() on every authenticated query.

-- current_org_id touches only pg_catalog (current_setting, coalesce, nullif,
-- casts). pg_catalog is always implicit, so an empty search_path is the
-- tightest safe setting.
alter function public.current_org_id()
  set search_path = '';

-- match_chunks references public.workbook_chunks (already schema-qualified)
-- but also uses the `<=>` operator from the pgvector extension, which lives
-- in the public schema. Pinning search_path to public keeps operator
-- resolution working and matches the convention the Phase 3 auth hook uses.
alter function public.match_chunks(vector, int, uuid)
  set search_path = public;
