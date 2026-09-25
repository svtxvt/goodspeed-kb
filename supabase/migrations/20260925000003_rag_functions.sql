-- Functions the API calls through PostgREST. All are SECURITY INVOKER, so they
-- run with the caller's permissions and RLS applies inside them.

-- Replaces all chunks of a document, but only if the document is still at the
-- version the chunks were computed from. Returns false when it is not (a newer
-- write already re-indexed it), which makes `pnpm reindex` safe to run while
-- users are editing.
create function public.replace_document_chunks(
  p_document_id uuid,
  p_version     int,
  p_chunks      jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
    from public.documents
   where id = p_document_id and version = p_version
     for update;

  if not found then
    return false;
  end if;

  delete from public.document_chunks where document_id = p_document_id;

  insert into public.document_chunks (document_id, user_id, chunk_index, content, embedding_space, embedding)
  select p_document_id, v_user_id, c.chunk_index, c.content, c.embedding_space, c.embedding::extensions.vector
    from jsonb_to_recordset(p_chunks) as c(chunk_index int, content text, embedding_space text, embedding text);

  return true;
end;
$$;

-- Creates (p_id null) or updates a document and replaces its chunks in ONE
-- transaction, so a document and its index never disagree. The API computes
-- the embeddings before calling this; if embedding fails nothing is written.
--   p_chunks null        -> title/content unchanged, keep the existing chunks
--   version mismatch     -> SQLSTATE KB409 (API: 409 Conflict)
--   no visible document  -> SQLSTATE KB404 (API: 404 Not Found)
create function public.save_document(
  p_id               uuid,
  p_expected_version int,
  p_title            text,
  p_content          text,
  p_tags             text[],
  p_chunks           jsonb
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  if p_id is null then
    insert into public.documents (title, content, tags)
    values (p_title, p_content, p_tags)
    returning * into v_doc;
  else
    update public.documents
       set title = p_title, content = p_content, tags = p_tags, version = version + 1
     where id = p_id and version = p_expected_version
    returning * into v_doc;

    if not found then
      if exists (select 1 from public.documents where id = p_id) then
        raise exception 'document was changed by another request' using errcode = 'KB409';
      end if;
      raise exception 'document not found' using errcode = 'KB404';
    end if;
  end if;

  if p_chunks is not null then
    perform public.replace_document_chunks(v_doc.id, v_doc.version, p_chunks);
  end if;

  return v_doc;
end;
$$;

-- Exact cosine search over the caller's chunks in one embedding space.
-- The explicit user filter duplicates RLS on purpose (defence in depth, and it
-- lets the planner use document_chunks_user_space_idx).
create function public.match_document_chunks(
  query_embedding extensions.vector,
  match_count     int,
  min_similarity  float,
  embedding_space text
)
returns table (
  chunk_id       bigint,
  document_id    uuid,
  document_title text,
  content        text,
  similarity     float
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.document_id, d.title, m.content, m.similarity
    from (
      select c.id, c.document_id, c.content,
             1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
        from public.document_chunks c
       where c.user_id = (select auth.uid())
         and c.embedding_space = match_document_chunks.embedding_space
       order by c.embedding operator(extensions.<=>) query_embedding
       limit least(greatest(match_count, 1), 50)
    ) m
    join public.documents d on d.id = m.document_id
   where m.similarity >= min_similarity
   order by m.similarity desc;
$$;

revoke execute on function public.replace_document_chunks(uuid, int, jsonb) from public, anon;
revoke execute on function public.save_document(uuid, int, text, text, text[], jsonb) from public, anon;
revoke execute on function public.match_document_chunks(extensions.vector, int, float, text) from public, anon;
grant execute on function public.replace_document_chunks(uuid, int, jsonb) to authenticated, service_role;
grant execute on function public.save_document(uuid, int, text, text, text[], jsonb) to authenticated, service_role;
grant execute on function public.match_document_chunks(extensions.vector, int, float, text) to authenticated, service_role;
