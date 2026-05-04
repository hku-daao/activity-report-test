-- Detail as JSON: fields from v_query_constituent plus aggregated CONSTITUENCY
-- from v_query_constituency where CONSTITUENTID matches v_query_constituent."ID".
--
DROP FUNCTION IF EXISTS public.get_constituent_detail(text);

CREATE OR REPLACE FUNCTION public.get_constituent_detail(p_lookup_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(q)
  FROM (
    SELECT
      v."LOOKUPID" AS Constituent_ID,
      v."FORMATTEDNAME" AS Formatted_Name,
      v."NICKNAME" AS Chinese_Name,
      v."MARITALSTATUSCODEID_TRANSLATION" AS Martial_Status,
      v."BIRTHDATE",
      v."GENDER",
      v."AGE",
      v."CONSTITUENTTYPE" AS Constituent_Type,
      string_agg(c."CONSTITUENCY", ', ') AS "CONSTITUENCY"
    FROM public.v_query_constituent v
    LEFT JOIN public.v_query_constituency c ON v."ID" = c."CONSTITUENTID"
    WHERE v."LOOKUPID" = NULLIF(btrim(p_lookup_id), '')
    GROUP BY
      v."LOOKUPID",
      v."FORMATTEDNAME",
      v."NICKNAME",
      v."MARITALSTATUSCODEID_TRANSLATION",
      v."BIRTHDATE",
      v."GENDER",
      v."AGE",
      v."CONSTITUENTTYPE"
  ) q
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_constituent_detail(text) IS
  'jsonb: detail fields from v_query_constituent plus aggregated CONSTITUENCY from v_query_constituency.';

GRANT EXECUTE ON FUNCTION public.get_constituent_detail(text) TO anon, authenticated;
