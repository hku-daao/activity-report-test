-- Default Supabase statement timeouts for API roles are short:
--   anon: 3s  ·  authenticated: 8s
-- Heavy RPCs (e.g. get_education) can hit those limits before the function's own
-- SET statement_timeout takes effect via PostgREST.
--
-- Run in Supabase SQL Editor, then reload PostgREST.
--
-- Verify:
--   select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated');
--
ALTER ROLE anon SET statement_timeout = '20s';
ALTER ROLE authenticated SET statement_timeout = '20s';

NOTIFY pgrst, 'reload config';
