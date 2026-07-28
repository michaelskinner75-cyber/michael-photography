alter table public.albums add column if not exists watermark_enabled boolean not null default false;
alter table public.albums add column if not exists watermark_type text not null default 'proof';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'albums_watermark_type_check'
  ) then
    alter table public.albums
      add constraint albums_watermark_type_check
      check (watermark_type in ('proof','logo'));
  end if;
end $$;
