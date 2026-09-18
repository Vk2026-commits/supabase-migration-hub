-- Accepted offers remain pending until onboarding and every required screening
-- item are complete. Companies may close a pending hire without deleting its
-- application, offer, screening, or onboarding audit trail.
ALTER TABLE public.hires
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.hire_screening_checks
  DROP CONSTRAINT IF EXISTS hire_screening_checks_status_check;
ALTER TABLE public.hire_screening_checks
  ADD CONSTRAINT hire_screening_checks_status_check
  CHECK (status IN ('not_started', 'pending', 'cleared', 'failed', 'review_required', 'not_required'));

CREATE OR REPLACE FUNCTION public.update_hire_screening_check(
  _hire_id uuid,
  _check_type text,
  _status text,
  _notes text DEFAULT NULL
) RETURNS public.hire_screening_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.hire_screening_checks;
BEGIN
  IF _check_type NOT IN ('background', 'drug', 'license', 'work_authorization') THEN
    RAISE EXCEPTION 'Unknown screening check';
  END IF;
  IF _status NOT IN ('not_started', 'pending', 'cleared', 'failed', 'review_required', 'not_required') THEN
    RAISE EXCEPTION 'Unknown screening status';
  END IF;

  UPDATE public.hire_screening_checks AS screening
  SET status = CASE WHEN screening.required AND _status = 'not_required' THEN screening.status ELSE _status END,
      notes = nullif(btrim(_notes), ''),
      completed_at = CASE WHEN _status IN ('cleared', 'failed', 'not_required') THEN now() ELSE NULL END,
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE screening.hire_id = _hire_id
    AND screening.check_type = _check_type
    AND (
      public.company_team_has_access(screening.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  RETURNING * INTO result;

  IF result.id IS NULL THEN RAISE EXCEPTION 'Screening check is not available'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_company_pending_onboarding_reviews(_company_id uuid)
RETURNS TABLE (hire_id uuid, officer_id uuid, officer_name text, packet_id uuid, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT hire.id, hire.officer_id, profile.full_name, packet.id, packet.submitted_at
  FROM public.hires AS hire
  JOIN public.officer_profiles AS officer ON officer.id = hire.officer_id
  JOIN public.profiles AS profile ON profile.id = officer.user_id
  JOIN LATERAL (
    SELECT onboarding.id, onboarding.submitted_at
    FROM public.officer_onboarding_packets AS onboarding
    WHERE onboarding.hire_id = hire.id AND onboarding.status = 'submitted'
    ORDER BY onboarding.updated_at DESC LIMIT 1
  ) AS packet ON true
  WHERE hire.company_id = _company_id
    AND hire.status = 'active'
    AND hire.onboarding_reviewed_at IS NULL
    AND (public.company_team_has_access(_company_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ORDER BY packet.submitted_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.complete_officer_onboarding(_hire_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hire_record public.hires%ROWTYPE;
  packet_status text;
  review_completed_at timestamptz;
BEGIN
  SELECT * INTO hire_record FROM public.hires WHERE id = _hire_id FOR UPDATE;
  IF hire_record.id IS NULL THEN RAISE EXCEPTION 'Hire record not found'; END IF;
  IF hire_record.status <> 'active' THEN RAISE EXCEPTION 'This pending hire is no longer active'; END IF;
  IF NOT public.company_team_has_access(hire_record.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You are not authorized to finalize this onboarding';
  END IF;

  SELECT status INTO packet_status FROM public.officer_onboarding_packets
  WHERE hire_id = _hire_id ORDER BY updated_at DESC LIMIT 1;
  IF packet_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'The officer must submit onboarding before it can be finalized';
  END IF;
  IF (SELECT count(*) FROM public.hire_screening_checks WHERE hire_id = _hire_id) <> 4 THEN
    RAISE EXCEPTION 'Screening requirements are incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hire_screening_checks
    WHERE hire_id = _hire_id AND required AND status <> 'cleared'
  ) THEN
    RAISE EXCEPTION 'Every required screening check must be cleared before onboarding can be finalized';
  END IF;

  IF hire_record.onboarding_reviewed_at IS NOT NULL THEN RETURN hire_record.onboarding_reviewed_at; END IF;

  review_completed_at := now();
  UPDATE public.hires
  SET employment_confirmed_at = COALESCE(employment_confirmed_at, review_completed_at),
      employment_confirmed_by = COALESCE(employment_confirmed_by, auth.uid()),
      onboarding_reviewed_at = review_completed_at,
      onboarding_reviewed_by = auth.uid(),
      updated_at = review_completed_at
  WHERE id = _hire_id;

  INSERT INTO public.employment_updates (hire_id, update_type, notes, created_by_user_id)
  VALUES (_hire_id, 'onboarding_completed', 'Company cleared required screening and finalized onboarding.', auth.uid());

  UPDATE public.notification_workflows
  SET status = 'completed', completed_at = review_completed_at, next_send_at = NULL, updated_at = review_completed_at
  WHERE kind = 'onboarding_submitted_company' AND hire_id = _hire_id AND status = 'active';

  RETURN review_completed_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_pending_hire(_hire_id uuid, _reason text)
RETURNS public.hires
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.hires%ROWTYPE;
BEGIN
  IF nullif(btrim(_reason), '') IS NULL THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;

  UPDATE public.hires AS hire
  SET status = 'not_hired', rejected_at = now(), rejected_by = auth.uid(),
      rejection_reason = btrim(_reason), updated_at = now()
  WHERE hire.id = _hire_id
    AND hire.status = 'active'
    AND hire.onboarding_reviewed_at IS NULL
    AND (
      public.company_team_has_access(hire.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  RETURNING * INTO result;

  IF result.id IS NULL THEN RAISE EXCEPTION 'Only an active pending hire can be moved to Not Hired'; END IF;

  UPDATE public.job_applications AS application SET status = 'declined', updated_at = now()
  WHERE application.id IN (
    SELECT offer.job_application_id FROM public.employment_offers AS offer
    WHERE offer.hire_id = _hire_id AND offer.job_application_id IS NOT NULL
  );
  UPDATE public.guard_hiring_applications AS application SET status = 'declined', updated_at = now()
  WHERE application.id = result.hiring_application_id;

  INSERT INTO public.employment_updates (hire_id, update_type, notes, created_by_user_id)
  VALUES (_hire_id, 'not_hired', btrim(_reason), auth.uid());

  UPDATE public.notification_workflows
  SET status = 'cancelled', completed_at = now(), next_send_at = NULL, updated_at = now()
  WHERE hire_id = _hire_id AND status = 'active';

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_pending_hire(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_pending_hire(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_hires_company_not_hired
  ON public.hires(company_id, rejected_at DESC) WHERE status = 'not_hired';
