-- Run in the same Profiles Supabase project as `activity_reports` (SQL editor).
-- Stores per-user daily journals; one row per user per calendar day (local app uses YYYY-MM-DD).

create table if not exists public.daily_journals (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  journal_date date not null,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firebase_uid, journal_date)
);

-- JSON array of { kind: 'link' | 'file', ... } (same shape as proactive_initiatives.attachment_items).
alter table public.daily_journals
  add column if not exists attachment_items jsonb not null default '[]'::jsonb;

create index if not exists daily_journals_uid_date_idx
  on public.daily_journals (firebase_uid, journal_date desc);

alter table public.daily_journals enable row level security;

drop policy if exists "daily_journals_allow_insert_anon" on public.daily_journals;
create policy "daily_journals_allow_insert_anon"
  on public.daily_journals for insert to anon with check (true);

drop policy if exists "daily_journals_allow_select_anon" on public.daily_journals;
create policy "daily_journals_allow_select_anon"
  on public.daily_journals for select to anon using (true);

drop policy if exists "daily_journals_allow_update_anon" on public.daily_journals;
create policy "daily_journals_allow_update_anon"
  on public.daily_journals for update to anon using (true) with check (true);

drop policy if exists "daily_journals_allow_delete_anon" on public.daily_journals;
create policy "daily_journals_allow_delete_anon"
  on public.daily_journals for delete to anon using (true);
