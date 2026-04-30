-- Run in the same Profiles Supabase project as `activity_reports`.
-- Expects table `public.v_query_constituent` with the columns used below.
-- The app uses `detail` (jsonb) in the multiple-match picker for "View details".
--
-- Requires `pg_trgm`. On Supabase, enable “pg_trgm” under Database → Extensions (installs into
-- the `extensions` schema). Helper functions set `search_path` to include `extensions` so
-- `similarity()` / `%` resolve; otherwise RPC fails with 42883 and the API shows a generic error.
--
-- Matching model (`search_v_query_constituent`):
--   * Client sends **first** + **last** name separately. Match: (**KEYNAME** ~ last) AND (**FIRSTNAME**
--     OR **MIDDLENAME** ~ first), **OR** combined first+last ~ **NICKNAME** (whole-string ILIKE).
--   * Optional **p_title** does not widen the row set — blended after name similarity (65% name / 35% title).
--   * Rows include `match_score` (0–100, one decimal) and are ordered best match first.
--
-- Haystack scoring concatenates NAME, KEYNAME, FIRSTNAME, MIDDLENAME, NICKNAME for trigram similarity.
-- Detail json only for final LIMIT rows.

-- Supabase installs extensions under schema `extensions`; unqualified `similarity()` needs it on search_path.
create extension if not exists pg_trgm with schema extensions;

-- Strips one or more leading English honorifics using only string comparison (no
-- fragile ARE regex) — avoids "quantifier operand invalid" in PostgreSQL.
create or replace function public._strip_leading_titles(p_in text)
returns text
language plpgsql
immutable
parallel safe
as $fn$
declare
  s text;
  t text;
  s_lower text;
  p text;
  plen int;
  n int;
  roundn int;
  pfx text[] := array[
    'the right honourable ', 'the right honorable ', 'the very reverend ', 'the honourable ',
    'the honorable ', 'the hon. ', 'the hon ', 'associate prof ', 'assistant prof ',
    'assoc. prof ', 'asst. prof ', 'asst prof ', 'assoc prof ', 'very reverend ', 'very rev ',
    'the very ', 'lieutenant ', 'reverend ', 'sergeant ', 'professor ', 'monsignor ', 'rector ',
    'father ', 'brother ', 'sister ', 'admiral ', 'colonel ', 'captain ', 'senator ', 'general ',
    'signorina ', 'signora ', 'signore ', 'ph.d. ', 'ph. d. ', 'd.d.s. ', 'd.v.m. ',
    'justice ', 'cdre ', 'h.e. ', 'h.o.n. ', 'd.s. ', 'd.r. ', 'h.o.n ', 'herr. ', 'mme. ', 'srta. ',
    'cpt ', 'capt. ', 'prof. ', 'mrs. ', 'ms. ', 'dr. ', 'mr. ', 'sgt. ', 'maj. ', 'gen. ', 'adm. ',
    'mrs ', 'ms ', 'miss ', 'mx. ', 'dr ', 'mr ', 'mx ', 'phd ', 'dds ', 'cpl ', 'cdr ',
    'sgt ', 'maj ', 'gen ', 'adm ', 'lt. ', 'lt ', 'col. ', 'col ', 'prof ', 'frau ',
    'dame ', 'herr ', 'mme ', 'srta ', 'rev. ', 'rev ', 'rabbi ', 'signor ',
    'hon. ', 'honourable ', 'honorable ', 'fr. ', 'sen. ', 'sen ', 'don ', 'cantor ',
    'imam ', 'judge ', 'the '
  ];
  j int;
  made_progress boolean;
  rest text;
begin
  s := btrim(regexp_replace(coalesce(p_in, ''), e'[[:space:]]+', ' ', 'g'));
  if s = '' then
    return null;
  end if;
  s_lower := lower(s);
  n := char_length(s);

  for roundn in 1 .. 30 loop
    t := s;
    made_progress := false;
    for j in 1 .. coalesce(array_length(pfx, 1), 0) loop
      p := pfx[j];
      plen := char_length(p);
      if n < plen or plen = 0 then
        continue;
      end if;
      if left(s_lower, plen) = lower(p) then
        if n <= plen then
          return null;
        end if;
        rest := btrim(substring(s from plen + 1));
        rest := regexp_replace(rest, e'^[.[:space:]]+', '', 1);
        rest := regexp_replace(rest, e'^[-,;:/]+', '', 1);
        s := btrim(rest);
        s_lower := lower(s);
        n := char_length(s);
        if s = '' or n = 0 then
          return null;
        end if;
        made_progress := true;
        exit;
      end if;
    end loop;
    if not made_progress or s = t then
      exit;
    end if;
  end loop;
  s := btrim(s);
  if s = '' or s = '.' then
    return null;
  end if;
  return s;
end;
$fn$;

comment on function public._strip_leading_titles(text) is
  'Removes common leading honorifics; not exposed to clients.';

-- Lowercase, collapse spaces — shared by similarity helpers.
create or replace function public._norm_match_text(p_in text)
returns text
language sql
immutable
parallel safe
as $q$
  select trim(regexp_replace(lower(trim(coalesce(p_in, ''))), e'[[:space:]]+', ' ', 'g'))
$q$;

-- Returns stripped honorific token(s) (lowercase, space-separated) and the remaining name string.
create or replace function public._extract_title_and_rest(p_in text)
returns table (title_parts text, rest_part text)
language plpgsql
immutable
parallel safe
as $fn$
declare
  s text;
  t text;
  s_lower text;
  p text;
  plen int;
  n int;
  roundn int;
  acc_title text := '';
  matched text;
  pfx text[] := array[
    'the right honourable ', 'the right honorable ', 'the very reverend ', 'the honourable ',
    'the honorable ', 'the hon. ', 'the hon ', 'associate prof ', 'assistant prof ',
    'assoc. prof ', 'asst. prof ', 'asst prof ', 'assoc prof ', 'very reverend ', 'very rev ',
    'the very ', 'lieutenant ', 'reverend ', 'sergeant ', 'professor ', 'monsignor ', 'rector ',
    'father ', 'brother ', 'sister ', 'admiral ', 'colonel ', 'captain ', 'senator ', 'general ',
    'signorina ', 'signora ', 'signore ', 'ph.d. ', 'ph. d. ', 'd.d.s. ', 'd.v.m. ',
    'justice ', 'cdre ', 'h.e. ', 'h.o.n. ', 'd.s. ', 'd.r. ', 'h.o.n ', 'herr. ', 'mme. ', 'srta. ',
    'cpt ', 'capt. ', 'prof. ', 'mrs. ', 'ms. ', 'dr. ', 'mr. ', 'sgt. ', 'maj. ', 'gen. ', 'adm. ',
    'mrs ', 'ms ', 'miss ', 'mx. ', 'dr ', 'mr ', 'mx ', 'phd ', 'dds ', 'cpl ', 'cdr ',
    'sgt ', 'maj ', 'gen ', 'adm ', 'lt. ', 'lt ', 'col. ', 'col ', 'prof ', 'frau ',
    'dame ', 'herr ', 'mme ', 'srta ', 'rev. ', 'rev ', 'rabbi ', 'signor ',
    'hon. ', 'honourable ', 'honorable ', 'fr. ', 'sen. ', 'sen ', 'don ', 'cantor ',
    'imam ', 'judge ', 'the '
  ];
  j int;
  made_progress boolean;
  rest text;
  orig text;
begin
  orig := btrim(regexp_replace(coalesce(p_in, ''), e'[[:space:]]+', ' ', 'g'));
  if orig = '' then
    return query select '', '';
    return;
  end if;
  s := orig;
  s_lower := lower(s);
  n := char_length(s);

  for roundn in 1 .. 30 loop
    t := s;
    made_progress := false;
    for j in 1 .. coalesce(array_length(pfx, 1), 0) loop
      p := pfx[j];
      plen := char_length(p);
      if n < plen or plen = 0 then
        continue;
      end if;
      if left(s_lower, plen) = lower(p) then
        if n <= plen then
          s := '';
          exit;
        end if;
        matched := substring(s from 1 for plen);
        matched := lower(btrim(matched));
        acc_title := case
          when acc_title = '' then matched
          else acc_title || ' ' || matched
        end;
        rest := btrim(substring(s from plen + 1));
        rest := regexp_replace(rest, e'^[.[:space:]]+', '', 1);
        rest := regexp_replace(rest, e'^[-,;:/]+', '', 1);
        s := btrim(rest);
        s_lower := lower(s);
        n := char_length(s);
        made_progress := true;
        exit;
      end if;
    end loop;
    if not made_progress or s = t then
      exit;
    end if;
  end loop;

  if s is null or s = '' or s = '.' then
    return query select acc_title, '';
    return;
  end if;
  return query select acc_title, s;
end;
$fn$;

comment on function public._extract_title_and_rest(text) is
  'Splits leading honorifics from the query for title vs name scoring.';

-- Best trigram similarity of query (rest / full) against CRM name fields.
create or replace function public._best_name_similarity(
  norm_rest text,
  norm_full text,
  formattedname text,
  name text,
  keyname text,
  firstname text,
  middlename text,
  maidenname text,
  nickname text
) returns double precision
language sql
immutable
parallel safe
set search_path = public, extensions, pg_catalog
as $fn$
  select greatest(
    coalesce(similarity(nullif($1, ''), nullif(public._norm_match_text($3), '')), 0::double precision),
    coalesce(similarity(nullif($1, ''), nullif(public._norm_match_text($4), '')), 0::double precision),
    coalesce(similarity(nullif($1, ''), nullif(public._norm_match_text($5), '')), 0::double precision),
    coalesce(
      similarity(
        nullif($1, ''),
        nullif(
          public._norm_match_text(
            trim(
              regexp_replace(
                coalesce($6, '') || ' ' || coalesce($7, '') || ' ' || coalesce($8, ''),
                e'[[:space:]]+',
                ' ',
                'g'
              )
            )
          ),
          ''
        )
      ),
      0::double precision
    ),
    coalesce(similarity(nullif($1, ''), nullif(public._norm_match_text($9), '')), 0::double precision),
    coalesce(similarity(nullif($2, ''), nullif(public._norm_match_text($3), '')), 0::double precision),
    coalesce(similarity(nullif($2, ''), nullif(public._norm_match_text($4), '')), 0::double precision),
    coalesce(similarity(nullif($2, ''), nullif(public._norm_match_text($5), '')), 0::double precision)
  )
$fn$;

-- Compare stripped honorific text to CRM title translations.
create or replace function public._title_similarity(
  norm_title text,
  title1 text,
  title2 text
) returns double precision
language sql
immutable
parallel safe
set search_path = public, extensions, pg_catalog
as $fn$
  select case
    when nullif(trim(coalesce($1, '')), '') is null then 0::double precision
    else greatest(
      coalesce(similarity(nullif($1, ''), nullif(public._norm_match_text($2), '')), 0::double precision),
      coalesce(similarity(nullif($1, ''), nullif(public._norm_match_text($3), '')), 0::double precision),
      case
        when public._norm_match_text($2) ilike '%' || $1 || '%' then 0.92::double precision
        when public._norm_match_text($3) ilike '%' || $1 || '%' then 0.92::double precision
        else 0::double precision
      end
    )
  end
$fn$;

-- Two trigram comparisons (vs many in `_best_name_similarity`) — keeps RPC CPU down on large scans.
create or replace function public._haystack_name_similarity(
  norm_rest text,
  norm_full text,
  haystack text
) returns double precision
language sql
immutable
parallel safe
set search_path = public, extensions, pg_catalog
as $fn$
  select greatest(
    coalesce(similarity(nullif($1, ''), nullif(public._norm_match_text($3), '')), 0::double precision),
    coalesce(similarity(nullif($2, ''), nullif(public._norm_match_text($3), '')), 0::double precision)
  )
$fn$;

comment on function public._haystack_name_similarity(text, text, text) is
  'Cheap name score: similarity of norm_rest/norm_full vs one CRM haystack string.';

revoke all on function public._strip_leading_titles(text) from public;
grant execute on function public._strip_leading_titles(text) to postgres, service_role;

revoke all on function public._norm_match_text(text) from public;
grant execute on function public._norm_match_text(text) to postgres, service_role;

revoke all on function public._extract_title_and_rest(text) from public;
grant execute on function public._extract_title_and_rest(text) to postgres, service_role;

revoke all on function public._best_name_similarity(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public._best_name_similarity(text, text, text, text, text, text, text, text, text) to postgres, service_role;

revoke all on function public._title_similarity(text, text, text) from public;
grant execute on function public._title_similarity(text, text, text) to postgres, service_role;

revoke all on function public._haystack_name_similarity(text, text, text) from public;
grant execute on function public._haystack_name_similarity(text, text, text) to postgres, service_role;

-- `CREATE OR REPLACE` cannot change the return (OUT) row type; drop first when upgrading.
drop function if exists public.search_v_query_constituent(text);
drop function if exists public.search_v_query_constituent(text, int);
drop function if exists public.search_v_query_constituent(text, text, int);
drop function if exists public.search_v_query_constituent(text, text, text, int);

drop function if exists public._vqc_tokens_match_name_nickname(text, text, text[]);
drop function if exists public._vqc_kfn_match_row(text, text, text, text[], text[]);
drop function if exists public._perm_phrases_distinct(text[]);
drop function if exists public._perm_join_worker(text[], text[]);
drop function if exists public._search_tokens(text);
drop function if exists public._escape_ilike_pattern(text);

-- Search: **KEYNAME** / **FIRSTNAME** / **MIDDLENAME** / **NICKNAME** (see file header).
create or replace function public.search_v_query_constituent(
  p_first text,
  p_last text,
  p_title text default '',
  p_limit int default 25
)
returns table (
  lookupid text,
  display_name text,
  detail jsonb,
  match_score numeric
)
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
stable
as $search$
declare
  first_trim text;
  last_trim text;
  full_trim text;
  norm_name text;
  title_trim text;
  norm_title text;
  lim int := least(coalesce(nullif(p_limit, 0), 25), 50);
  esc_first text;
  esc_last text;
  esc_full text;
begin
  first_trim := trim(regexp_replace(trim(coalesce(p_first, '')), e'[[:space:]]+', ' ', 'g'));
  last_trim := trim(regexp_replace(trim(coalesce(p_last, '')), e'[[:space:]]+', ' ', 'g'));
  full_trim := trim(regexp_replace(first_trim || ' ' || last_trim, e'[[:space:]]+', ' ', 'g'));

  if full_trim = '' then
    return;
  end if;

  norm_name := public._norm_match_text(full_trim);
  title_trim := trim(regexp_replace(trim(coalesce(p_title, '')), e'[[:space:]]+', ' ', 'g'));
  norm_title := public._norm_match_text(title_trim);

  esc_first := replace(replace(replace(first_trim, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  esc_last := replace(replace(replace(last_trim, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
  esc_full := replace(replace(replace(full_trim, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  -- DB-side cap (Supabase pool / PostgREST may still enforce a shorter HTTP timeout in settings).
  perform set_config('statement_timeout', '300000', true);

  return query
  with thin as (
    select
      sq.lookupid,
      sq.display_name,
      round(
        case
          when norm_title <> '' then
            0.65::numeric * (public._haystack_name_similarity(norm_name, norm_name, sq.nh)::numeric * 100)
            + 0.35::numeric * (public._title_similarity(norm_title, sq.t1, sq.t2)::numeric * 100)
          else
            public._haystack_name_similarity(norm_name, norm_name, sq.nh)::numeric * 100
        end,
        1
      ) as match_score
    from (
      select
        trim(b."LOOKUPID"::text) as lookupid,
        coalesce(
          nullif(trim(b."FORMATTEDNAME"::text), ''),
          nullif(trim(b."NAME"::text), ''),
          nullif(trim(b."KEYNAME"::text), ''),
          trim(b."LOOKUPID"::text)
        ) as display_name,
        trim(
          regexp_replace(
            coalesce(b."NAME"::text, '') || ' ' ||
            coalesce(b."KEYNAME"::text, '') || ' ' ||
            coalesce(b."FIRSTNAME"::text, '') || ' ' ||
            coalesce(b."MIDDLENAME"::text, '') || ' ' ||
            coalesce(b."NICKNAME"::text, ''),
            e'[[:space:]]+',
            ' ',
            'g'
          )
        ) as nh,
        coalesce(nullif(trim(b."TITLECODEID_TRANSLATION"::text), ''), '') as t1,
        coalesce(nullif(trim(b."TITLE2CODEID_TRANSLATION"::text), ''), '') as t2
      from public.v_query_constituent b
      where
        b."LOOKUPID" is not null
        and trim(b."LOOKUPID"::text) <> ''
        and norm_name <> ''
        and (
          (
            first_trim <> ''
            and last_trim <> ''
            and coalesce(b."KEYNAME"::text, '') ilike '%' || esc_last || '%' escape '\'
            and (
              coalesce(b."FIRSTNAME"::text, '') ilike '%' || esc_first || '%' escape '\'
              or coalesce(b."MIDDLENAME"::text, '') ilike '%' || esc_first || '%' escape '\'
            )
          )
          or (
            coalesce(b."NICKNAME"::text, '') ilike '%' || esc_full || '%' escape '\'
          )
          or (
            first_trim = ''
            and last_trim <> ''
            and coalesce(b."KEYNAME"::text, '') ilike '%' || esc_last || '%' escape '\'
          )
          or (
            first_trim <> ''
            and last_trim = ''
            and (
              coalesce(b."FIRSTNAME"::text, '') ilike '%' || esc_first || '%' escape '\'
              or coalesce(b."MIDDLENAME"::text, '') ilike '%' || esc_first || '%' escape '\'
            )
          )
        )
    ) sq
  ),
  ranked as (
    select
      thin.*,
      row_number() over (
        partition by thin.lookupid
        order by thin.match_score desc nulls last, thin.display_name
      ) as rn
    from thin
  ),
  top_rows as (
    select r.lookupid, r.display_name, r.match_score
    from ranked r
    where r.rn = 1
    order by r.match_score desc nulls last, r.display_name
    limit lim
  )
  select
    t.lookupid,
    t.display_name,
    nullif(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', nullif(trim(br."ID"::text), ''),
          'lookup_id', nullif(trim(br."LOOKUPID"::text), ''),
          'keyname', nullif(br."KEYNAME"::text, ''),
          'firstname', nullif(br."FIRSTNAME"::text, ''),
          'middlename', nullif(br."MIDDLENAME"::text, ''),
          'maidenname', nullif(br."MAIDENNAME"::text, ''),
          'nickname', nullif(br."NICKNAME"::text, ''),
          'name', nullif(br."NAME"::text, ''),
          'formattedname', nullif(br."FORMATTEDNAME"::text, ''),
          'title', nullif(br."TITLECODEID_TRANSLATION"::text, ''),
          'title2', nullif(br."TITLE2CODEID_TRANSLATION"::text, ''),
          'gender', nullif(br."GENDER"::text, ''),
          'birthdate', nullif(br."BIRTHDATE"::text, ''),
          'age', br."AGE",
          'deceased', case
            when br."DECEASED" is null then null
            else br."DECEASED"::text
          end,
          'deceaseddate', nullif(br."DECEASEDDATE"::text, ''),
          'deceased_years', br."DECEASEDYEARS",
          'isgroup', case
            when br."ISGROUP" is null then null
            else br."ISGROUP"::text
          end,
          'constituenttype', nullif(br."CONSTITUENTTYPE"::text, ''),
          'marital_status', nullif(
            br."MARITALSTATUSCODEID_TRANSLATION"::text,
            ''
          ),
          'deceased_confirmation', nullif(
            br."DECEASEDCONFIRMATION"::text, ''
          ),
          'deceased_source', nullif(
            br."DECEASEDSOURCECODEID_TRANSLATION"::text, ''
          ),
          'webaddress', nullif(br."WEBADDRESS"::text, ''),
          'is_inactive', br."ISINACTIVE"::text,
          'gives_anonymously', br."GIVESANONYMOUSLY"::text,
          'donotmail', br."DONOTMAIL"::text,
          'donotemail', br."DONOTEMAIL"::text,
          'donotphone', br."DONOTPHONE"::text,
          'dateadded', br."DATEADDED"::text,
          'datechanged', br."DATECHANGED"::text,
          'primary_business_id', nullif(
            br."PRIMARYBUSINESS_ID"::text,
            ''
          ),
          'sequence_id', br."SEQUENCEID"
        )
      ),
      '{}'::jsonb
    ) as detail,
    t.match_score
  from top_rows t
  inner join lateral (
    select *
    from public.v_query_constituent br
    where trim(br."LOOKUPID"::text) = t.lookupid
    limit 1
  ) br on true;
end;
$search$;

grant execute on function public.search_v_query_constituent(text, text, text, int) to anon, authenticated, service_role;

comment on function public.search_v_query_constituent is
  'Constituent lookup: KEYNAME/FIRSTNAME/MIDDLENAME split match OR full string vs NICKNAME; haystack scoring; optional title blend.';

-- After any signature or return-type change, refresh PostgREST in the SQL editor:
--   notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Optional: trigram GIN indexes on `v_query_constituent` (run separately; use CONCURRENTLY on prod).
--
-- Error `operator class "extensions.gin_trgm_ops" does not exist` means pg_trgm was NOT installed
-- in schema `extensions` (often it lives in `public`). Use only `gin_trgm_ops` — no schema prefix —
-- so Postgres picks the opclass from wherever `pg_trgm` is installed:
--
--   SELECT n.nspname
--   FROM pg_extension e
--   JOIN pg_namespace n ON n.oid = e.extnamespace
--   WHERE e.extname = 'pg_trgm';
--
-- Columns touched by the RPC filter (ILIKE; optional GIN per column):
--   "KEYNAME", "FIRSTNAME", "MIDDLENAME", "NICKNAME"
--
-- Example:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS v_query_constituent_keyname_trgm
--     ON public.v_query_constituent USING gin ("KEYNAME" gin_trgm_ops);
-- Then: ANALYZE public.v_query_constituent;
--
-- If you truly installed pg_trgm in `extensions`, qualify only then:
--   USING gin ("NAME" extensions.gin_trgm_ops);
