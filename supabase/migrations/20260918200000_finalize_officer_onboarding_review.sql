-- Companies need an explicit final review after an officer submits onboarding.
-- Submission remains immutable; this separate audit marker controls the temporary
-- officer-facing status banner and preserves who finalized the company review.
ALTER TABLE public.hires
  ADD COLUMN IF NOT EXISTS onboarding_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hires_company_pending_onboarding_review
  ON public.hires(company_id, employment_confirmed_at DESC)
  WHERE employment_confirmed_at IS NOT NULL AND onboarding_reviewed_at IS NULL;

COMMENT ON COLUMN public.hires.onboarding_reviewed_at IS
  'Set after an authorized company user reviews a submitted onboarding packet and marks onboarding complete.';

CREATE OR REPLACE FUNCTION public.get_company_pending_onboarding_reviews(_company_id uuid)
RETURNS TABLE (
  hire_id uuid,
  officer_id uuid,
  officer_name text,
  packet_id uuid,
  submitted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hire.id,
    hire.officer_id,
    profile.full_name,
    packet.id,
    packet.submitted_at
  FROM public.hires AS hire
  JOIN public.officer_profiles AS officer ON officer.id = hire.officer_id
  JOIN public.profiles AS profile ON profile.id = officer.user_id
  JOIN LATERAL (
    SELECT onboarding.id, onboarding.submitted_at
    FROM public.officer_onboarding_packets AS onboarding
    WHERE onboarding.hire_id = hire.id
      AND onboarding.status = 'submitted'
    ORDER BY onboarding.updated_at DESC
    LIMIT 1
  ) AS packet ON true
  WHERE hire.company_id = _company_id
    AND hire.status = 'active'
    AND hire.employment_confirmed_at IS NOT NULL
    AND hire.onboarding_reviewed_at IS NULL
    AND (
      public.company_team_has_access(_company_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY packet.submitted_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_company_pending_onboarding_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_pending_onboarding_reviews(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_officer_onboarding(_hire_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hire_record public.hires%ROWTYPE;
  packet_record public.officer_onboarding_packets%ROWTYPE;
  review_completed_at timestamptz;
BEGIN
  SELECT * INTO hire_record
  FROM public.hires
  WHERE id = _hire_id
  FOR UPDATE;

  IF hire_record.id IS NULL THEN
    RAISE EXCEPTION 'Hire record not found';
  END IF;

  IF NOT public.company_team_has_access(
    hire_record.company_id,
    ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
  ) AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You are not authorized to finalize this onboarding';
  END IF;

  IF hire_record.employment_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Employment must be confirmed before onboarding can be finalized';
  END IF;

  SELECT * INTO packet_record
  FROM public.officer_onboarding_packets
  WHERE hire_id = _hire_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF packet_record.id IS NULL OR packet_record.status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'The officer must submit onboarding before it can be finalized';
  END IF;

  IF hire_record.onboarding_reviewed_at IS NOT NULL THEN
    RETURN hire_record.onboarding_reviewed_at;
  END IF;

  review_completed_at := now();
  UPDATE public.hires
  SET onboarding_reviewed_at = review_completed_at,
      onboarding_reviewed_by = auth.uid(),
      updated_at = review_completed_at
  WHERE id = _hire_id;

  INSERT INTO public.employment_updates (
    hire_id,
    update_type,
    notes,
    created_by_user_id
  ) VALUES (
    _hire_id,
    'onboarding_completed',
    'Company reviewed the submitted onboarding packet and marked onboarding complete.',
    auth.uid()
  );

  UPDATE public.notification_workflows
  SET status = 'completed',
      completed_at = review_completed_at,
      next_send_at = NULL,
      updated_at = review_completed_at
  WHERE kind = 'onboarding_submitted_company'
    AND hire_id = _hire_id
    AND status = 'active';

  RETURN review_completed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_officer_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_officer_onboarding(uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_officer_onboarding(uuid) IS
  'Audits company review of a submitted onboarding packet and clears the officer temporary status banner.';
