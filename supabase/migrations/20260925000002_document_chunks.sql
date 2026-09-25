-- RAG storage: one row per chunk with its embedding.

create extension if not exists vector with schema extensions;

create table public.document_chunks (
  id              bigint generated always as identity primary key,
  document_id     uuid not null,
  user_id         uuid not null default auth.uid(),
  chunk_index     int not null check (chunk_index >= 0),
  content         text not null,
  -- Which model produced the vector, e.g. "openai:text-embedding-3-small:1536".
  -- Vectors are only comparable within one space, so search filters on it.
  embedding_space text not null,
  -- Unconstrained dimension: the space decides it, not the schema. The price is
  -- no ANN index (pgvector indexes need a fixed dimension), so search is an
  -- exact scan over the caller's rows. See README "Trade-offs".
  embedding       extensions.vector not null,
  unique (document_id, chunk_index),
  -- A chunk's owner can never differ from its document's owner.
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);

create index document_chunks_user_space_idx on public.document_chunks (user_id, embedding_space);

alter table public.document_chunks enable row level security;

create policy chunks_select_own on public.document_chunks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy chunks_insert_own on public.document_chunks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy chunks_delete_own on public.document_chunks
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.document_chunks from anon;
