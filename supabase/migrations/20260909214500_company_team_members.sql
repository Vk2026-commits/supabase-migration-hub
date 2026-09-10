-- Company teams share one company profile instead of creating duplicate companies.
CREATE TYPE public.company_member_role AS ENUM ('owner', 'admin', 'hiring_manager', 'reviewer');

CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.company_member_role NOT NULL DEFAULT 'reviewer',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

CREATE UNIQUE INDEX company_members_one_company_per_user
  ON public.company_members(user_id);
CREATE INDEX company_members_company_idx ON public.company_members(company_id, status);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

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
      AND member.status IN ('active', 'invited')
      AND member.role = ANY(_allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.company_team_has_access(uuid, public.company_member_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_team_has_access(uuid, public.company_member_role[]) TO authenticated;

CREATE POLICY "Company members can view their membership"
  ON public.company_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.company_team_has_access(company_id, ARRAY['owner', 'admin']::public.company_member_role[]));

CREATE POLICY "Company team can view company profile"
  ON public.company_profiles FOR SELECT TO authenticated
  USING (public.company_team_has_access(id));

CREATE POLICY "Company administrators can update company profile"
  ON public.company_profiles FOR UPDATE TO authenticated
  USING (public.company_team_has_access(id, ARRAY['owner', 'admin']::public.company_member_role[]))
  WITH CHECK (public.company_team_has_access(id, ARRAY['owner', 'admin']::public.company_member_role[]));

CREATE POLICY "Company team can view job postings"
  ON public.job_postings FOR SELECT TO authenticated
  USING (public.company_team_has_access(company_id));
CREATE POLICY "Company hiring team can create job postings"
  ON public.job_postings FOR INSERT TO authenticated
  WITH CHECK (public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]));
CREATE POLICY "Company hiring team can update job postings"
  ON public.job_postings FOR UPDATE TO authenticated
  USING (public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]));
CREATE POLICY "Company hiring team can delete job postings"
  ON public.job_postings FOR DELETE TO authenticated
  USING (public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]));

CREATE POLICY "Company team can view job applications"
  ON public.job_applications FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_postings posting
    WHERE posting.id = job_posting_id AND public.company_team_has_access(posting.company_id)
  ));
CREATE POLICY "Company hiring team can update job applications"
  ON public.job_applications FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_postings posting
    WHERE posting.id = job_posting_id
      AND public.company_team_has_access(posting.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  ));

CREATE POLICY "Company team can view employer application copies"
  ON public.guard_hiring_applications FOR SELECT TO authenticated
  USING (application_type = 'employer_copy' AND EXISTS (
    SELECT 1
    FROM public.job_applications application
    JOIN public.job_postings posting ON posting.id = application.job_posting_id
    WHERE application.id = job_application_id AND public.company_team_has_access(posting.company_id)
  ));

CREATE POLICY "Company team can view employment offers"
  ON public.employment_offers FOR SELECT TO authenticated
  USING (public.company_team_has_access(company_id));

CREATE POLICY "Company team can view hires"
  ON public.hires FOR SELECT TO authenticated
  USING (public.company_team_has_access(company_id));
CREATE POLICY "Company hiring team can update hires"
  ON public.hires FOR UPDATE TO authenticated
  USING (public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]));

CREATE POLICY "Company team can view officer interests"
  ON public.officer_interests FOR SELECT TO authenticated
  USING (public.company_team_has_access(company_id));
CREATE POLICY "Company hiring team can manage officer interests"
  ON public.officer_interests FOR ALL TO authenticated
  USING (public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]))
  WITH CHECK (public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]));

-- Existing owner rows are represented explicitly so every company has a complete team roster.
INSERT INTO public.company_members (company_id, user_id, email, role, status, joined_at)
SELECT company.id, company.user_id, profile.email, 'owner', 'active', company.created_at
FROM public.company_profiles company
JOIN public.profiles profile ON profile.id = company.user_id
ON CONFLICT (company_id, user_id) DO NOTHING;

-- Preserve the signatures of the established authorization helpers while making
-- them work for every authorized user on the company team.
CREATE OR REPLACE FUNCTION public.company_hired_officer(_company_user_id uuid, _officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hires hire
    JOIN public.company_profiles company ON company.id = hire.company_id
    WHERE hire.officer_id = _officer_id
      AND (
        company.user_id = _company_user_id
        OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = company.id AND member.user_id = _company_user_id AND member.status IN ('active', 'invited'))
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
        OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = company.id AND member.user_id = _company_user_id AND member.status IN ('active', 'invited'))
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
        OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = company.id AND member.user_id = _company_user_id AND member.status IN ('active', 'invited'))
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
        OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = company.id AND member.user_id = _company_user_id AND member.status IN ('active', 'invited'))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.company_can_view_officer_contact(_company_user_id uuid, _officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.company_hired_officer(_company_user_id, _officer_id)
    OR public.company_received_application(_company_user_id, _officer_id)
    OR (public.company_interested_in_officer(_company_user_id, _officer_id) AND public.company_has_paid_tier(_company_user_id));
$$;

CREATE OR REPLACE FUNCTION public.company_has_applicant_relationship(_company_user_id uuid, _officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.company_received_application(_company_user_id, _officer_id)
    OR public.company_hired_officer(_company_user_id, _officer_id)
    OR public.company_interested_in_officer(_company_user_id, _officer_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_application_evidence(_application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guard_hiring_applications hiring_application
    WHERE hiring_application.id = _application_id
      AND (
        hiring_application.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'view_only'::public.app_role)
        OR public.has_role(auth.uid(), 'full_access'::public.app_role)
        OR (
          hiring_application.job_application_id IS NOT NULL
          AND public.company_has_paid_tier(auth.uid())
          AND EXISTS (
            SELECT 1 FROM public.job_applications application
            JOIN public.job_postings posting ON posting.id = application.job_posting_id
            WHERE application.id = hiring_application.job_application_id
              AND public.company_team_has_access(posting.company_id)
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_company_onboarding_progress(_company_id uuid)
RETURNS TABLE (hire_id uuid, officer_id uuid, packet_id uuid, status text, current_step integer, updated_at timestamptz, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hire.id, hire.officer_id, packet.id, COALESCE(packet.status, 'not_started'), COALESCE(packet.current_step, 0), packet.updated_at, packet.submitted_at
  FROM public.hires hire
  LEFT JOIN public.officer_onboarding_packets packet ON packet.hire_id = hire.id
  WHERE hire.company_id = _company_id AND hire.status = 'active'
    AND (public.company_team_has_access(_company_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
$$;

REVOKE ALL ON FUNCTION public.get_company_onboarding_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_onboarding_progress(uuid) TO authenticated;

COMMENT ON TABLE public.company_members IS 'Authorized users sharing one company account; owner rows mirror company_profiles.user_id.';
