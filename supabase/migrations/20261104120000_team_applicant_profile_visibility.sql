-- Applicant identities must be readable by active staff of the hiring company,
-- not only by the company owner. Keep unrelated officer profiles protected.
CREATE OR REPLACE FUNCTION public.company_team_can_read_applicant_identity(_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.officer_profiles officer
    JOIN public.job_applications application ON application.officer_id = officer.id
    JOIN public.job_postings posting ON posting.id = application.job_posting_id
    WHERE officer.user_id = _profile_id
      AND public.company_team_has_access(posting.company_id)
  );
$$;
REVOKE ALL ON FUNCTION public.company_team_can_read_applicant_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_team_can_read_applicant_identity(uuid) TO authenticated;

DROP POLICY IF EXISTS "Company staff can read their applicant identities" ON public.profiles;
CREATE POLICY "Company staff can read their applicant identities"
ON public.profiles FOR SELECT TO authenticated
USING (
  role = 'officer'::public.user_role
  AND public.company_team_can_read_applicant_identity(id)
);
