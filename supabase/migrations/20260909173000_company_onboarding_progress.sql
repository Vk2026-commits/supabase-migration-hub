-- Companies need operational onboarding progress without access to unfinished
-- form answers or sensitive payroll/identity data.
CREATE OR REPLACE FUNCTION public.get_company_onboarding_progress(_company_id uuid)
RETURNS TABLE (
  hire_id uuid,
  officer_id uuid,
  packet_id uuid,
  status text,
  current_step integer,
  updated_at timestamptz,
  submitted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    h.id AS hire_id,
    h.officer_id,
    packet.id AS packet_id,
    COALESCE(packet.status, 'not_started') AS status,
    COALESCE(packet.current_step, 0) AS current_step,
    packet.updated_at,
    packet.submitted_at
  FROM public.hires h
  JOIN public.company_profiles company ON company.id = h.company_id
  LEFT JOIN public.officer_onboarding_packets packet ON packet.hire_id = h.id
  WHERE h.company_id = _company_id
    AND h.status = 'active'
    AND (
      company.user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    );
$$;

REVOKE ALL ON FUNCTION public.get_company_onboarding_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_onboarding_progress(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_company_onboarding_progress(uuid) IS
  'Returns non-sensitive onboarding status for hires belonging to the requesting company.';
