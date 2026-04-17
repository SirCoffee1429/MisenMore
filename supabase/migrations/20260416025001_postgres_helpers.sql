-- Phase 2 Migration 4 — Postgres helpers + RAG vector index.
-- current_org_id() is the heart of the RLS system: pure function that pulls
-- org_id out of app_metadata in the current JWT. Every RLS policy written
-- in Phase 7 calls this.

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

-- match_chunks: org-scoped vector similarity search used by the
-- kitchen-assistant edge function. p_org_id must be passed explicitly
-- because edge functions run with service role and bypass RLS.
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

-- IVFFlat index for fast cosine similarity search on workbook_chunks.
-- lists = 100 is a reasonable default for small-to-mid corpora; revisit
-- once row count exceeds ~1M.
create index on public.workbook_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
