
CREATE OR REPLACE FUNCTION public.get_hkuf(cid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'RECOGNITIONLEVEL', sub.recognitionlevel,
        'JOINDATE', sub.joindate,
        'TOTALAMOUNT', sub.totalamount,
        'COMMENTS', sub.comments
      )
      ORDER BY sub.joindate DESC NULLS LAST, sub.rl_amount DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      rl."NAME" AS recognitionlevel,
      cr."JOINDATE" AS joindate,
      cr."TOTALAMOUNT" AS totalamount,
      cr."COMMENTS" AS comments,
      rl."AMOUNT" AS rl_amount
    FROM public.CONSTITUENTRECOGNITION cr
    INNER JOIN public.RECOGNITIONLEVEL rl ON cr."RECOGNITIONLEVELID" = rl."ID"
    WHERE cr."CONSTITUENTID" = cid
      AND cr."RECOGNITIONPROGRAMID" = '988604C5-48E8-4793-8442-10FBAA9E3FFB'
      AND cr."STATUS" = 'Active'
  ) sub;
$$;

COMMENT ON FUNCTION public.get_hkuf(uuid) IS
  'jsonb array (0..n rows): HKU Foundation membership from CONSTITUENTRECOGNITION / RECOGNITIONLEVEL.';

GRANT EXECUTE ON FUNCTION public.get_hkuf(uuid) TO anon, authenticated;
