-- Run once in Supabase SQL Editor: creates a table keyed by Firebase Auth UID.
-- Adjust RLS policies for production (this example allows anon read/write for local dev).

create table if not exists public.profiles (
  firebase_uid text primary key,
  email text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Dev-friendly policies: replace with policies tied to your auth model in production.
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_all" on public.profiles for insert with check (true);
create policy "profiles_update_all" on public.profiles for update using (true);
