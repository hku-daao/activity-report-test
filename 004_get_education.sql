-- If calls still stop at ~3s, the Supabase `anon` role default (3s) is likely
-- winning. Run `005_supabase_anon_statement_timeout.sql` and NOTIFY pgrst.
--
DROP FUNCTION IF EXISTS public.get_education(uuid);

CREATE OR REPLACE FUNCTION public.get_education(cid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
		'Institution', sub.Institution,
        'Class_Of', sub.Class_Of,
        'Preffered_Class_Of', sub.Preffered_Class_Of,
        'Status', sub.Status,
        'Faculty', sub.Faculty,
        'Department', sub.Department,
        'Curriculum', sub.Curriculum,
        'Curriculum_full_title', sub.Curriculum_full_title,
        'Curriculum_exit_full_title', sub.Curriculum_exit_full_title,
        'major_minor', sub.major_minor,
        'Result', sub.Result,
        'Full_Part_time', sub.Full_Part_time,
        'Admission_Date', sub.Admission_Date,
        'Graduate_Date', sub.Graduate_Date,
		'Year_Left', sub.Year_Left
      )
      ORDER BY sub.Class_Of DESC NULLS LAST, sub.Graduate_Date DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      EH.educationalinstitutionname as Institution,
      EH.classof AS Class_Of,
      EH.preferredclassyear AS Preffered_Class_Of,
      EH.EDUCATIONALHISTORYSTATUS AS Status,
      Fac."VALUE" AS Faculty,
      Dep."VALUE" AS Department,
      EH."DEGREE" AS Curriculum,
      EH.EDUCATIONALPROGRAM AS Curriculum_full_title,
      Cur."VALUE" AS Curriculum_exit_full_title,
      MM."VALUE" AS major_minor,
      EH.AWARDED AS Result,
      FPT."VALUE" AS Full_Part_time,
      EH.STARTDATE AS Admission_Date,
      EH.dategraduated AS Graduate_Date,
      substring(EH.dateleft, 1, 4) as Year_Left
    FROM public.V_QUERY_EDUCATIONALHISTORY AS EH
    LEFT OUTER JOIN public.V_QUERY_ATTRIBUTE42A5DB90D3DD43DE8423BCABFC5466A9 AS Fac
      ON EH."id" = Fac."ID"
    LEFT OUTER JOIN public.V_QUERY_ATTRIBUTE6F38F1EC9B684CB7A8D71C0826696034 AS Dep
      ON EH."id" = Dep."ID"
    LEFT JOIN public.V_QUERY_ATTRIBUTE10F17B7AA2994407888912FC7F4A80DA AS MM
      ON EH."id" = MM."ID"
    LEFT OUTER JOIN public.V_QUERY_ATTRIBUTE829A746C924B4CBAB2CAAFB428EE8F06 AS Cur
      ON EH."id" = Cur."ID"
    LEFT OUTER JOIN public.V_QUERY_ATTRIBUTE04117C88C9E144FA8331CB4528E7785B AS FPT
      ON EH."id" = FPT."ID"
    WHERE EH.CONSTITUENTID = cid
  ) sub;
$$;

COMMENT ON FUNCTION public.get_education(uuid) IS
  'jsonb array (0..n rows): education history from V_QUERY_EDUCATIONALHISTORY and attribute views. statement_timeout 20s for heavy joins.';

GRANT EXECUTE ON FUNCTION public.get_education(uuid) TO anon, authenticated;
