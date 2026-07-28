alter table public.albums add column if not exists view_count bigint not null default 0;

create table if not exists public.photo_reactions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  visitor_id text not null,
  reaction text not null check (reaction in ('like','love')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(photo_id, visitor_id)
);

alter table public.photo_reactions enable row level security;

drop policy if exists "Public can view photo reactions" on public.photo_reactions;
create policy "Public can view photo reactions"
on public.photo_reactions for select
to anon, authenticated
using (true);

drop policy if exists "Public can add photo reactions" on public.photo_reactions;
create policy "Public can add photo reactions"
on public.photo_reactions for insert
to anon, authenticated
with check (reaction in ('like','love'));

drop policy if exists "Public can update photo reactions" on public.photo_reactions;
create policy "Public can update photo reactions"
on public.photo_reactions for update
to anon, authenticated
using (true)
with check (reaction in ('like','love'));

grant select, insert, update on public.photo_reactions to anon, authenticated;

grant select on public.albums to anon, authenticated;

create or replace function public.increment_album_view(p_album_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  update public.albums
  set view_count = view_count + 1
  where id = p_album_id
  returning view_count into new_count;
  return coalesce(new_count, 0);
end;
$$;

grant execute on function public.increment_album_view(uuid) to anon, authenticated;

create or replace function public.set_photo_reaction(p_photo_id uuid, p_visitor_id text, p_reaction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reaction not in ('like','love') then
    raise exception 'Invalid reaction';
  end if;

  insert into public.photo_reactions(photo_id, visitor_id, reaction)
  values (p_photo_id, p_visitor_id, p_reaction)
  on conflict (photo_id, visitor_id)
  do update set reaction = excluded.reaction, updated_at = now();
end;
$$;

grant execute on function public.set_photo_reaction(uuid, text, text) to anon, authenticated;

create index if not exists photo_reactions_photo_id_idx on public.photo_reactions(photo_id);
