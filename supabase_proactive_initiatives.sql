-- Run in the same Profiles Supabase project as `activity_reports` / `daily_journals`.
-- User-defined title + free-text body; creator stored as firebase_uid.

create table if not exists public.proactive_initiatives (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  title text not null default '',
  body text not null default '',
  attachment_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proactive_initiatives_uid_updated_idx
  on public.proactive_initiatives (firebase_uid, updated_at desc);

-- One-time: add `attachment_items` if the table was created before this column existed.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proactive_initiatives'
      and column_name = 'attachment_items'
  ) then
    alter table public.proactive_initiatives
      add column attachment_items jsonb not null default '[]'::jsonb;
  end if;
end $$;

alter table public.proactive_initiatives enable row level security;

drop policy if exists "proactive_initiatives_allow_insert_anon" on public.proactive_initiatives;
create policy "proactive_initiatives_allow_insert_anon"
  on public.proactive_initiatives for insert to anon with check (true);

drop policy if exists "proactive_initiatives_allow_select_anon" on public.proactive_initiatives;
create policy "proactive_initiatives_allow_select_anon"
  on public.proactive_initiatives for select to anon using (true);

drop policy if exists "proactive_initiatives_allow_update_anon" on public.proactive_initiatives;
create policy "proactive_initiatives_allow_update_anon"
  on public.proactive_initiatives for update to anon using (true) with check (true);

drop policy if exists "proactive_initiatives_allow_delete_anon" on public.proactive_initiatives;
create policy "proactive_initiatives_allow_delete_anon"
  on public.proactive_initiatives for delete to anon using (true);
