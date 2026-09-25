-- Write integrity for writes that bypass the API.
--
-- A signed-in user may PATCH their own documents directly through PostgREST
-- (RLS allows it: it is their data). Such a write skips the version check and
-- re-embedding. Two guards keep the invariants anyway:
--   1. every UPDATE bumps `version` in a trigger, so an editor that opened the
--      old version gets 409 instead of silently overwriting the change;
--   2. an UPDATE that changes title or content drops the document's chunks, so
--      search never returns text the document no longer contains (it stops
--      being searchable until the next save or `pnpm reindex`).
-- save_document itself now refuses changed text without new chunks.

create or replace function public.documents_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  if (new.title, new.content) is distinct from (old.title, old.content) then
    delete from public.document_chunks where document_id = old.id;
  end if;
  return new;
end;
$$;

drop trigger documents_set_updated_at on public.documents;
drop function public.set_updated_at();

create trigger documents_before_update
before update on public.documents
for each row execute function public.documents_before_update();

-- Same signature and contract as before (see 20260925000003), plus:
--   p_chunks null with changed title/content (or on create) -> SQLSTATE KB422
-- The version is now bumped by the trigger, not here.
create or replace function public.save_document(
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
    if p_chunks is null then
      raise exception 'a new document needs its chunks' using errcode = 'KB422';
    end if;
    insert into public.documents (title, content, tags)
    values (p_title, p_content, p_tags)
    returning * into v_doc;
  else
    select * into v_doc from public.documents where id = p_id for update;
    if not found then
      raise exception 'document not found' using errcode = 'KB404';
    end if;
    if v_doc.version <> p_expected_version then
      raise exception 'document was changed by another request' using errcode = 'KB409';
    end if;
    if p_chunks is null and (v_doc.title, v_doc.content) is distinct from (p_title, p_content) then
      raise exception 'title or content changed but no chunks were given' using errcode = 'KB422';
    end if;

    update public.documents
       set title = p_title, content = p_content, tags = p_tags
     where id = p_id
    returning * into v_doc;
  end if;

  if p_chunks is not null then
    perform public.replace_document_chunks(v_doc.id, v_doc.version, p_chunks);
  end if;

  return v_doc;
end;
$$;
