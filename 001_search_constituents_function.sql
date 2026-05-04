-- Search: strip honorifics (Mr, Ms, Dr, …) for name matching; name tokens must
-- all match NICKNAME or FORMATTEDNAME. Title tokens add to the score when they
-- appear in FORMATTEDNAME or TITLECODEID_TRANSLATION. SCORE is 0–100; results
-- ordered by SCORE descending.
--
-- Token cleanup trims whitespace and common Western punctuation only — not
-- letters outside [a-z0-9], so Chinese/CJK and other Unicode scripts stay in
-- the token list (older ^[^a-z0-9]+ patterns stripped CJK entirely).
--
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP FUNCTION IF EXISTS public.search_constituents(text);

CREATE OR REPLACE FUNCTION public.search_constituents(search_query text)
RETURNS TABLE (
  "LOOKUPID" varchar(100),
  "NICKNAME" varchar(50),
  "FORMATTEDNAME" varchar(404),
  "SCORE" numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  title_list AS (
    SELECT ARRAY[
      'mr', 'mrs', 'ms', 'miss', 'mss', 'dr', 'doctor', 'prof', 'professor',
      'sir', 'madam', 'mme', 'rev', 'reverend', 'hon', 'honorable', 'lady',
      'lord', 'fr', 'sr', 'jr', 'esq', 'mx', 'sister', 'father', 'mother',
      'capt', 'captain', 'major', 'col', 'colonel', 'gen', 'general',
      'judge', 'duc', 'duchess', 'phd', 'md'
    ]::text[] AS titles
  ),
  raw_toks AS (
    SELECT
      lower(trim(t.token)) AS tok,
      t.ord
    FROM unnest(string_to_array(btrim(search_query), ' '))
      WITH ORDINALITY AS t(token, ord)
    WHERE trim(t.token) <> ''
  ),
  cleaned AS (
    SELECT
      regexp_replace(
        regexp_replace(
          btrim(rt.tok),
          '^[\s''"\.,;:!?()\[\]{}–—\-]+',
          '',
          'g'
        ),
        '[\s''"\.,;:!?()\[\]{}–—\-]+$',
        '',
        'g'
      ) AS tok,
      rt.ord
    FROM raw_toks rt
    WHERE trim(rt.tok) <> ''
  ),
  cls AS (
    SELECT
      c.tok,
      c.ord,
      regexp_replace(c.tok, '\.+$', '') = ANY (tl.titles) AS is_title
    FROM cleaned c
    CROSS JOIN title_list tl
    WHERE c.tok <> ''
  ),
  np AS (
    SELECT
      COALESCE(
        (SELECT string_agg(tok, ' ' ORDER BY ord) FROM cls WHERE NOT cls.is_title),
        ''
      ) AS q,
      COALESCE(
        (SELECT array_agg(tok ORDER BY ord) FROM cls WHERE NOT cls.is_title),
        ARRAY[]::text[]
      ) AS arr
  ),
  tp AS (
    SELECT
      COALESCE(
        (SELECT string_agg(tok, ' ' ORDER BY ord) FROM cls WHERE cls.is_title),
        ''
      ) AS q,
      COALESCE(
        (SELECT array_agg(tok ORDER BY ord) FROM cls WHERE cls.is_title),
        ARRAY[]::text[]
      ) AS arr
  ),
  scored AS (
    SELECT
      v."LOOKUPID" AS lid,
      v."NICKNAME" AS nk,
      v."FORMATTEDNAME" AS fn,
      GREATEST(
        COALESCE(
          similarity(
            lower(COALESCE(v."FORMATTEDNAME", '')),
            lower(COALESCE((SELECT q FROM np), ''))
          ),
          0::real
        ),
        COALESCE(
          similarity(
            lower(COALESCE(v."NICKNAME", '')),
            lower(COALESCE((SELECT q FROM np), ''))
          ),
          0::real
        )
      )::numeric AS name_sim,
      CASE
        WHEN COALESCE(cardinality((SELECT arr FROM tp)), 0) = 0 THEN 1::numeric
        ELSE (
          SELECT
            COUNT(*)::numeric
            / NULLIF(cardinality((SELECT arr FROM tp)), 0)::numeric
          FROM unnest((SELECT arr FROM tp)) AS tw(tok)
          WHERE
            COALESCE(v."FORMATTEDNAME", '') ILIKE '%' || tw.tok || '%'
            OR COALESCE(v."TITLECODEID_TRANSLATION", '') ILIKE '%' || tw.tok || '%'
        )
      END AS title_frac,
      GREATEST(
        COALESCE(
          similarity(
            lower(COALESCE(v."FORMATTEDNAME", '')),
            lower(COALESCE((SELECT q FROM tp), ''))
          ),
          0::real
        ),
        COALESCE(
          similarity(
            lower(COALESCE(v."NICKNAME", '')),
            lower(COALESCE((SELECT q FROM tp), ''))
          ),
          0::real
        )
      )::numeric AS title_only_sim
    FROM public.v_query_constituent v
    WHERE NULLIF(btrim(search_query), '') IS NOT NULL
      AND (
        (
          COALESCE(cardinality((SELECT arr FROM np)), 0) > 0
          AND NOT EXISTS (
            SELECT 1
            FROM unnest((SELECT arr FROM np)) AS nw(tok)
            WHERE NOT (
              COALESCE(v."NICKNAME", '') ILIKE '%' || nw.tok || '%'
              OR COALESCE(v."FORMATTEDNAME", '') ILIKE '%' || nw.tok || '%'
            )
          )
        )
        OR (
          COALESCE(cardinality((SELECT arr FROM np)), 0) = 0
          AND COALESCE(cardinality((SELECT arr FROM tp)), 0) > 0
          AND EXISTS (
            SELECT 1
            FROM unnest((SELECT arr FROM tp)) AS tw(tok)
            WHERE
              COALESCE(v."FORMATTEDNAME", '') ILIKE '%' || tw.tok || '%'
              OR COALESCE(v."TITLECODEID_TRANSLATION", '') ILIKE '%' || tw.tok || '%'
          )
        )
      )
  ),
  raw_score AS (
    SELECT
      s.lid,
      s.nk,
      s.fn,
      CASE
        WHEN COALESCE((SELECT q FROM np), '') <> '' THEN
          LEAST(
            100::numeric,
            ROUND(
              (s.name_sim * 0.65 + s.title_frac * 0.35) * 100::numeric,
              1
            )
          )
        ELSE
          LEAST(
            100::numeric,
            ROUND(
              (s.title_only_sim * 0.45 + s.title_frac * 0.55) * 100::numeric,
              1
            )
          )
      END AS sc
    FROM scored s
  )
  SELECT
    y."LOOKUPID",
    y."NICKNAME",
    y."FORMATTEDNAME",
    y."SCORE"
  FROM (
    SELECT DISTINCT ON (raw_score.lid)
      raw_score.lid AS "LOOKUPID",
      raw_score.nk AS "NICKNAME",
      raw_score.fn AS "FORMATTEDNAME",
      raw_score.sc AS "SCORE"
    FROM raw_score
    ORDER BY raw_score.lid, raw_score.sc DESC
  ) y
  ORDER BY y."SCORE" DESC;
$$;

COMMENT ON FUNCTION public.search_constituents(text) IS
  'Token search; titles excluded from name matching; SCORE 0–100; ordered by SCORE desc.';

GRANT EXECUTE ON FUNCTION public.search_constituents(text) TO anon, authenticated;
