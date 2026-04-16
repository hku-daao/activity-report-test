-- Run in the Access Supabase project SQL editor (same `public` schema as `staff`, `team`, `subordinate`).
--
-- The foreign key on `app_access_list.email` requires `staff.email` to be UNIQUE.
-- If create fails with a FK error, add a unique constraint first, e.g.:
--   alter table public.staff add constraint staff_email_key unique (email);

alter table public.staff
  add constraint staff_email_key unique (email);

create table if not exists public.app_list (
  id bigint generated always as identity primary key,
  appname text not null,
  description text,
  active boolean not null default true,
  constraint app_list_appname_key unique (appname)
);

-- Foreign key to `app_list.id`. (Named `app_id` here so it is not confused with
-- `app_list.appname`, which is the separate unique text “app id” column.)
create table if not exists public.app_access_list (
  id bigint generated always as identity primary key,
  app_id bigint not null references public.app_list (id) on delete cascade,
  email text not null references public.staff (email) on delete cascade,
  active boolean not null default true,
  constraint app_access_list_app_id_email_key unique (app_id, email)
);

create index if not exists app_access_list_email_idx on public.app_access_list (email);
create index if not exists app_access_list_app_id_idx on public.app_access_list (app_id);


ALTER TABLE public.app_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_access_list ENABLE ROW LEVEL SECURITY;