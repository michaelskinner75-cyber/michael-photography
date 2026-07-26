create extension if not exists "pgcrypto";

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  event_date date,
  expires_at timestamptz,
  cover_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.albums add column if not exists expires_at timestamptz;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  storage_path text not null unique,
  image_url text not null,
  thumbnail_url text,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists albums_public_expiry_idx on public.albums (is_public, expires_at);
create index if not exists photos_album_sort_idx on public.photos (album_id, sort_order);

alter table public.albums enable row level security;
alter table public.photos enable row level security;

drop policy if exists "Public can view public albums" on public.albums;
create policy "Public can view public albums"
on public.albums for select
using (
  auth.role() = 'authenticated'
  or (is_public = true and (expires_at is null or expires_at > now()))
);

drop policy if exists "Public can view photos in public albums" on public.photos;
create policy "Public can view photos in public albums"
on public.photos for select
using (
  exists (
    select 1 from public.albums
    where albums.id = photos.album_id
      and (
        auth.role() = 'authenticated'
        or (albums.is_public = true and (albums.expires_at is null or albums.expires_at > now()))
      )
  )
);

drop policy if exists "Authenticated users manage albums" on public.albums;
create policy "Authenticated users manage albums"
on public.albums for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users manage photos" on public.photos;
create policy "Authenticated users manage photos"
on public.photos for all
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public photo viewing" on storage.objects;
create policy "Public photo viewing"
on storage.objects for select
using (bucket_id = 'photos');

drop policy if exists "Authenticated photo upload" on storage.objects;
create policy "Authenticated photo upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'photos');

drop policy if exists "Authenticated photo update" on storage.objects;
create policy "Authenticated photo update"
on storage.objects for update
to authenticated
using (bucket_id = 'photos')
with check (bucket_id = 'photos');

drop policy if exists "Authenticated photo deletion" on storage.objects;
create policy "Authenticated photo deletion"
on storage.objects for delete
to authenticated
using (bucket_id = 'photos');