-- Run in the Profiles Supabase project (SQL editor) so Submit can insert rows.
-- Adjust RLS policies for your security model; the anon key requires policies to allow inserts.

create table if not exists public.activity_reports (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null,
  title text,
  team_filter text not null,
  attending_staff_ids jsonb not null default '[]'::jsonb,
  other_people_enabled boolean not null default false,
  other_people_names text[] not null default '{}',
  other_party_name text,
  crm_constituent_no text,
  event_at timestamptz,
  duration_minutes int not null default 0,
  detail text not null default '',
  attachment_urls text[] not null default '{}',
  status text not null check (status in ('draft', 'submitted')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.activity_reports enable row level security;

-- The app uses the Supabase anon key from the browser; Firebase handles sign-in, so
-- there is no Supabase auth.uid(). You must allow the anon role to insert (and optionally read).

drop policy if exists "activity_reports_allow_insert_anon" on public.activity_reports;

create policy "activity_reports_allow_insert_anon"
  on public.activity_reports
  for insert
  to anon
  with check (true);

-- Optional: allow reading rows with the anon key (e.g. future “my reports” UI).
drop policy if exists "activity_reports_allow_select_anon" on public.activity_reports;

create policy "activity_reports_allow_select_anon"
  on public.activity_reports
  for select
  to anon
  using (true);

-- Draft save / submit cleanup
drop policy if exists "activity_reports_allow_update_anon" on public.activity_reports;

create policy "activity_reports_allow_update_anon"
  on public.activity_reports
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "activity_reports_allow_delete_anon" on public.activity_reports;

create policy "activity_reports_allow_delete_anon"
  on public.activity_reports
  for delete
  to anon
  using (true);

-- If the table already existed without title:
alter table public.activity_reports add column if not exists title text;

-- Soft delete (dashboard hides unless “show deleted”)
alter table public.activity_reports add column if not exists deleted_at timestamptz;

create index if not exists activity_reports_deleted_at_idx
  on public.activity_reports (deleted_at)
  where deleted_at is not null;

-- Soft delete RPC: avoids relying on UPDATE ... RETURNING when SELECT RLS hides
-- rows once deleted_at is set (e.g. policy USING (deleted_at is null)).
create or replace function public.soft_delete_activity_report(
  p_id uuid,
  p_firebase_uid text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.activity_reports
  set
    deleted_at = coalesce(deleted_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = p_id
    and trim(firebase_uid) = trim(p_firebase_uid);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

grant execute on function public.soft_delete_activity_report(uuid, text) to anon;
