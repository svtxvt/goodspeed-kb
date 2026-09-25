-- Documents owned by a Supabase Auth user.
--
-- Access control lives in the database: the API talks to Postgres with the
-- caller's JWT, so RLS applies to every query, including one that forgets a
-- user filter.

create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  content    text not null default '' check (char_length(content) <= 100000),
  tags       text[] not null default '{}' check (cardinality(tags) <= 20),
  -- Optimistic concurrency: every write must name the version it was based on.
  version    int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of the composite foreign key from document_chunks.
  unique (id, user_id)
);

create index documents_user_updated_idx on public.documents (user_id, updated_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

alter table public.documents enable row level security;

-- (select auth.uid()) is evaluated once per statement instead of once per row.
create policy documents_select_own on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy documents_insert_own on public.documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy documents_update_own on public.documents
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy documents_delete_own on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.documents from anon;
