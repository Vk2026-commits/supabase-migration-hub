-- A recipient is authenticated before completing the invitation setup flow.
-- Only an explicitly active team membership may authorize company access.
CREATE OR REPLACE FUNCTION public.company_team_has_access(
  _company_id uuid,
  _allowed_roles public.company_member_role[] DEFAULT ARRAY['owner', 'admin', 'hiring_manager', 'reviewer']::public.company_member_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_profiles company
    WHERE company.id = _company_id AND company.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.company_members member
    WHERE member.company_id = _company_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
      AND member.role = ANY(_allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.company_team_has_access(uuid, public.company_member_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_team_has_access(uuid, public.company_member_role[]) TO authenticated;

-- Preserve the established helper signatures while excluding every pending
-- invitation state from indirect company/officer relationship checks.
CREATE OR REPLACE FUNCTION public.company_hired_officer(_company_user_id uuid, _officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hires hire
    JOIN public.company_profiles company ON company.id = hire.company_id
    WHERE hire.officer_id = _officer_id
      AND (
        company.user_id = _company_user_id
        OR EXISTS (
          SELECT 1 FROM public.company_members member
          WHERE member.company_id = company.id
            AND member.user_id = _company_user_id
            AND member.status = 'active'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.company_interested_in_officer(_company_user_id uuid, _officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.officer_interests interest
    JOIN public.company_profiles company ON company.id = interest.company_id
    WHERE interest.officer_id = _officer_id AND interest.status = 'interested'
      AND (
        company.user_id = _company_user_id
        OR EXISTS (
          SELECT 1 FROM public.company_members member
          WHERE member.company_id = company.id
            AND member.user_id = _company_user_id
            AND member.status = 'active'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.company_has_paid_tier(_company_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_profiles company
    WHERE company.subscription_tier IN ('professional', 'premium')
      AND (
        company.user_id = _company_user_id
        OR EXISTS (
          SELECT 1 FROM public.company_members member
          WHERE member.company_id = company.id
            AND member.user_id = _company_user_id
            AND member.status = 'active'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.company_received_application(_company_user_id uuid, _officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.job_applications application
    JOIN public.job_postings posting ON posting.id = application.job_posting_id
    JOIN public.company_profiles company ON company.id = posting.company_id
    WHERE application.officer_id = _officer_id
      AND (
        company.user_id = _company_user_id
        OR EXISTS (
          SELECT 1 FROM public.company_members member
          WHERE member.company_id = company.id
            AND member.user_id = _company_user_id
            AND member.status = 'active'
        )
      )
  );
$$;

-- When the current user is acting for a company, require all fields that the
-- dashboard uses to define a complete hiring profile. For unrelated officers
-- and platform administrators this returns true, leaving their existing RLS
-- authorization unchanged.
CREATE OR REPLACE FUNCTION public.company_hiring_profile_ready(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.company_profiles company
      WHERE company.id = _company_id
        AND (
          company.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.company_members member
            WHERE member.company_id = company.id
              AND member.user_id = auth.uid()
              AND member.status = 'active'
          )
        )
    ) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.company_profiles company
      WHERE company.id = _company_id
        AND nullif(btrim(company.company_name), '') IS NOT NULL
        AND nullif(btrim(company.company_address), '') IS NOT NULL
        AND nullif(btrim(company.company_city), '') IS NOT NULL
        AND nullif(btrim(company.company_state), '') IS NOT NULL
        AND nullif(btrim(company.company_zip), '') IS NOT NULL
        AND nullif(btrim(company.contact_person_name), '') IS NOT NULL
        AND nullif(btrim(company.contact_email), '') IS NOT NULL
        AND nullif(btrim(company.contact_cell_phone), '') IS NOT NULL
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.company_hiring_profile_ready_for_job(_job_posting_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT public.company_hiring_profile_ready(posting.company_id)
     FROM public.job_postings posting WHERE posting.id = _job_posting_id),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.company_hiring_profile_ready_for_application(_job_application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT public.company_hiring_profile_ready(posting.company_id)
     FROM public.job_applications application
     JOIN public.job_postings posting ON posting.id = application.job_posting_id
     WHERE application.id = _job_application_id),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.company_hiring_profile_ready(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_hiring_profile_ready_for_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_hiring_profile_ready_for_application(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_hiring_profile_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_hiring_profile_ready_for_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_hiring_profile_ready_for_application(uuid) TO authenticated;

-- Restrictive policies are ANDed with existing permissive policies, closing
-- direct API access without changing unrelated officer/admin permissions.
CREATE POLICY "Complete company profile required for hiring job postings"
  ON public.job_postings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.company_hiring_profile_ready(company_id))
  WITH CHECK (public.company_hiring_profile_ready(company_id));

CREATE POLICY "Complete company profile required for hiring applications"
  ON public.job_applications AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.company_hiring_profile_ready_for_job(job_posting_id))
  WITH CHECK (public.company_hiring_profile_ready_for_job(job_posting_id));

CREATE POLICY "Complete company profile required for employer application copies"
  ON public.guard_hiring_applications AS RESTRICTIVE FOR ALL TO authenticated
  USING (job_application_id IS NULL OR public.company_hiring_profile_ready_for_application(job_application_id))
  WITH CHECK (job_application_id IS NULL OR public.company_hiring_profile_ready_for_application(job_application_id));

CREATE POLICY "Complete company profile required for employment offers"
  ON public.employment_offers AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.company_hiring_profile_ready(company_id))
  WITH CHECK (public.company_hiring_profile_ready(company_id));

CREATE POLICY "Complete company profile required for hires"
  ON public.hires AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.company_hiring_profile_ready(company_id))
  WITH CHECK (public.company_hiring_profile_ready(company_id));

CREATE POLICY "Complete company profile required for officer interests"
  ON public.officer_interests AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.company_hiring_profile_ready(company_id))
  WITH CHECK (public.company_hiring_profile_ready(company_id));
