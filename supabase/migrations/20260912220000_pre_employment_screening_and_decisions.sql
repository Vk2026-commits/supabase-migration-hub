-- Track pre-employment checks separately from onboarding. A submitted packet is
-- necessary, but required checks must also be cleared before final hiring.
CREATE TABLE public.hire_screening_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id uuid NOT NULL REFERENCES public.hires(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  check_type text NOT NULL CHECK (check_type IN ('background', 'drug', 'license', 'work_authorization')),
  required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'pending', 'cleared', 'review_required', 'not_required')),
  notes text,
  completed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hire_id, check_type)
);

ALTER TABLE public.hire_screening_checks ENABLE ROW LEVEL SECURITY;
CREATE INDEX hire_screening_checks_company_idx ON public.hire_screening_checks(company_id, updated_at DESC);

CREATE POLICY "Company hiring team views screening checks"
ON public.hire_screening_checks FOR SELECT TO authenticated
USING (
  public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Company hiring team updates screening checks"
ON public.hire_screening_checks FOR UPDATE TO authenticated
USING (
  public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.company_team_has_access(company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.seed_hire_screening_checks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hire_screening_checks (hire_id, company_id, check_type, required, status)
  VALUES
    (NEW.id, NEW.company_id, 'background', coalesce((NEW.offer_terms->>'backgroundCheckRequired')::boolean, false), CASE WHEN coalesce((NEW.offer_terms->>'backgroundCheckRequired')::boolean, false) THEN 'not_started' ELSE 'not_required' END),
    (NEW.id, NEW.company_id, 'drug', coalesce((NEW.offer_terms->>'drugTestRequired')::boolean, false), CASE WHEN coalesce((NEW.offer_terms->>'drugTestRequired')::boolean, false) THEN 'not_started' ELSE 'not_required' END),
    (NEW.id, NEW.company_id, 'license', coalesce((NEW.offer_terms->>'licenseVerificationRequired')::boolean, false), CASE WHEN coalesce((NEW.offer_terms->>'licenseVerificationRequired')::boolean, false) THEN 'not_started' ELSE 'not_required' END),
    (NEW.id, NEW.company_id, 'work_authorization', coalesce((NEW.offer_terms->>'workAuthorizationRequired')::boolean, false), CASE WHEN coalesce((NEW.offer_terms->>'workAuthorizationRequired')::boolean, false) THEN 'not_started' ELSE 'not_required' END)
  ON CONFLICT (hire_id, check_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_hire_screening_checks ON public.hires;
CREATE TRIGGER seed_hire_screening_checks
AFTER INSERT ON public.hires
FOR EACH ROW EXECUTE FUNCTION public.seed_hire_screening_checks();

INSERT INTO public.hire_screening_checks (hire_id, company_id, check_type, required, status)
SELECT hire.id, hire.company_id, check_kind.check_type,
  CASE check_kind.check_type
    WHEN 'background' THEN coalesce((hire.offer_terms->>'backgroundCheckRequired')::boolean, false)
    WHEN 'drug' THEN coalesce((hire.offer_terms->>'drugTestRequired')::boolean, false)
    WHEN 'license' THEN coalesce((hire.offer_terms->>'licenseVerificationRequired')::boolean, false)
    WHEN 'work_authorization' THEN coalesce((hire.offer_terms->>'workAuthorizationRequired')::boolean, false)
  END,
  CASE WHEN CASE check_kind.check_type
    WHEN 'background' THEN coalesce((hire.offer_terms->>'backgroundCheckRequired')::boolean, false)
    WHEN 'drug' THEN coalesce((hire.offer_terms->>'drugTestRequired')::boolean, false)
    WHEN 'license' THEN coalesce((hire.offer_terms->>'licenseVerificationRequired')::boolean, false)
    WHEN 'work_authorization' THEN coalesce((hire.offer_terms->>'workAuthorizationRequired')::boolean, false)
  END THEN 'not_started' ELSE 'not_required' END
FROM public.hires AS hire
CROSS JOIN (VALUES ('background'), ('drug'), ('license'), ('work_authorization')) AS check_kind(check_type)
ON CONFLICT (hire_id, check_type) DO NOTHING;

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
  IF _status NOT IN ('not_started', 'pending', 'cleared', 'review_required', 'not_required') THEN
    RAISE EXCEPTION 'Unknown screening status';
  END IF;

  UPDATE public.hire_screening_checks AS screening
  SET status = CASE WHEN screening.required AND _status = 'not_required' THEN screening.status ELSE _status END,
      notes = nullif(btrim(_notes), ''),
      completed_at = CASE WHEN _status IN ('cleared', 'not_required') THEN now() ELSE NULL END,
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

REVOKE ALL ON FUNCTION public.update_hire_screening_check(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_hire_screening_check(uuid, text, text, text) TO authenticated;

-- Strengthen the final confirmation function introduced in the prior migration.
CREATE OR REPLACE FUNCTION public.confirm_officer_hire(_hire_id uuid)
RETURNS public.hires
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hire_row public.hires;
  packet_status text;
BEGIN
  SELECT * INTO hire_row FROM public.hires WHERE id = _hire_id FOR UPDATE;
  IF hire_row.id IS NULL THEN RAISE EXCEPTION 'Hire record not found'; END IF;

  IF NOT public.company_team_has_access(hire_row.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You are not authorized to confirm this hire';
  END IF;
  IF hire_row.employment_confirmed_at IS NOT NULL THEN RETURN hire_row; END IF;

  SELECT packet.status INTO packet_status
  FROM public.officer_onboarding_packets AS packet
  WHERE packet.hire_id = hire_row.id
  ORDER BY packet.updated_at DESC LIMIT 1;
  IF packet_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'The officer must submit onboarding before the hire can be confirmed';
  END IF;

  IF (SELECT count(*) FROM public.hire_screening_checks AS screening WHERE screening.hire_id = hire_row.id) <> 4 THEN
    RAISE EXCEPTION 'Screening requirements are incomplete; reopen the applicant before hiring';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hire_screening_checks AS screening
    WHERE screening.hire_id = hire_row.id
      AND screening.required
      AND screening.status <> 'cleared'
  ) THEN
    RAISE EXCEPTION 'Every required pre-employment check must be cleared before hiring';
  END IF;

  UPDATE public.hires
  SET employment_confirmed_at = now(), employment_confirmed_by = auth.uid(), updated_at = now()
  WHERE id = hire_row.id
  RETURNING * INTO hire_row;
  RETURN hire_row;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_officer_hire(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_officer_hire(uuid) TO authenticated;

-- Do not allow a client to bypass the RPC by updating the hire row directly.
CREATE OR REPLACE FUNCTION public.enforce_hire_confirmation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.employment_confirmed_at IS NULL AND NEW.employment_confirmed_at IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.officer_onboarding_packets AS packet
      WHERE packet.hire_id = NEW.id AND packet.status = 'submitted'
    ) THEN
      RAISE EXCEPTION 'Onboarding must be submitted before employment is confirmed';
    END IF;
    IF (SELECT count(*) FROM public.hire_screening_checks AS screening WHERE screening.hire_id = NEW.id) <> 4 THEN
      RAISE EXCEPTION 'Screening requirements are incomplete; reopen the applicant before hiring';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.hire_screening_checks AS screening
      WHERE screening.hire_id = NEW.id
        AND screening.required
        AND screening.status <> 'cleared'
    ) THEN
      RAISE EXCEPTION 'Every required pre-employment check must be cleared before hiring';
    END IF;
    IF NEW.employment_confirmed_by IS NULL THEN NEW.employment_confirmed_by := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Interview requests now support an officer response and company lifecycle controls.
ALTER TABLE public.interview_schedules
  ADD COLUMN IF NOT EXISTS response_status text NOT NULL DEFAULT 'pending'
    CHECK (response_status IN ('pending', 'accepted', 'declined')),
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE OR REPLACE FUNCTION public.respond_to_interview(_interview_id uuid, _response text)
RETURNS public.interview_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.interview_schedules;
BEGIN
  IF _response NOT IN ('accepted', 'declined') THEN RAISE EXCEPTION 'Choose accept or decline'; END IF;
  UPDATE public.interview_schedules AS interview
  SET response_status = _response, responded_at = now(), updated_at = now()
  WHERE interview.id = _interview_id
    AND interview.status = 'scheduled'
    AND interview.scheduled_at > now()
    AND EXISTS (
      SELECT 1 FROM public.officer_profiles AS officer
      WHERE officer.id = interview.officer_id AND officer.user_id = auth.uid()
    )
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'This interview request is no longer available'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_interview(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_interview(uuid, text) TO authenticated;

-- Email events for the missing decision points in the hiring workflow.
ALTER TABLE public.notification_workflows DROP CONSTRAINT IF EXISTS notification_workflows_kind_check;
ALTER TABLE public.notification_workflows ADD CONSTRAINT notification_workflows_kind_check CHECK (kind IN (
  'application_reminder', 'application_submitted_officer', 'application_submitted_company',
  'offer_action', 'offer_response_company', 'onboarding_action',
  'onboarding_submitted_officer', 'onboarding_submitted_company',
  'interview_scheduled_officer', 'interview_updated_officer', 'interview_cancelled_officer',
  'interview_response_company', 'hire_confirmed_officer'
));

CREATE OR REPLACE FUNCTION public.queue_interview_workflow_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE officer_record record; company_name text; recipient record; job_title text; event_kind text; event_key text; notification_context jsonb;
BEGIN
  SELECT officer.user_id, profile.email, profile.full_name INTO officer_record
  FROM public.officer_profiles officer JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;
  SELECT company.company_name, posting.title INTO company_name, job_title
  FROM public.company_profiles company
  LEFT JOIN public.job_applications application ON application.id = NEW.job_application_id
  LEFT JOIN public.job_postings posting ON posting.id = application.job_posting_id
  WHERE company.id = NEW.company_id;
  IF officer_record.user_id IS NULL THEN RETURN NEW; END IF;

  notification_context := jsonb_build_object(
    'officer_name', coalesce(officer_record.full_name, 'Security professional'),
    'company_name', coalesce(company_name, 'the hiring company'),
    'position', coalesce(job_title, 'Security Officer'),
    'scheduled_at', NEW.scheduled_at,
    'interview_type', NEW.interview_type
  );

  IF TG_OP = 'INSERT' THEN
    event_kind := 'interview_scheduled_officer'; event_key := 'interview-scheduled:' || NEW.id::text;
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    event_kind := 'interview_cancelled_officer'; event_key := 'interview-cancelled:' || NEW.id::text;
  ELSIF OLD.response_status IS DISTINCT FROM NEW.response_status AND NEW.response_status IN ('accepted', 'declined') THEN
    FOR recipient IN SELECT * FROM public.company_notification_recipients(NEW.company_id) LOOP
      PERFORM public.enqueue_notification_workflow(
        'interview_response_company', recipient.user_id, recipient.email,
        'interview-response:' || NEW.id::text || ':' || NEW.response_status,
        NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL,
        notification_context || jsonb_build_object('response', NEW.response_status), now()
      );
    END LOOP;
    RETURN NEW;
  ELSIF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at OR OLD.interview_type IS DISTINCT FROM NEW.interview_type OR OLD.meeting_url IS DISTINCT FROM NEW.meeting_url OR OLD.location IS DISTINCT FROM NEW.location THEN
    event_kind := 'interview_updated_officer'; event_key := 'interview-updated:' || NEW.id::text || ':' || extract(epoch from NEW.updated_at)::bigint::text;
  ELSE RETURN NEW;
  END IF;

  PERFORM public.enqueue_notification_workflow(
    event_kind, officer_record.user_id, officer_record.email, event_key,
    NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_interview_workflow_notifications_on_interview ON public.interview_schedules;
CREATE TRIGGER queue_interview_workflow_notifications_on_interview
AFTER INSERT OR UPDATE ON public.interview_schedules
FOR EACH ROW EXECUTE FUNCTION public.queue_interview_workflow_notifications();

CREATE OR REPLACE FUNCTION public.queue_offer_response_company_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE officer_name text; company_name text; recipient record;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status NOT IN ('accepted', 'declined') THEN RETURN NEW; END IF;
  SELECT profile.full_name INTO officer_name FROM public.officer_profiles officer JOIN public.profiles profile ON profile.id = officer.user_id WHERE officer.id = NEW.officer_id;
  SELECT company.company_name INTO company_name FROM public.company_profiles company WHERE company.id = NEW.company_id;
  FOR recipient IN SELECT * FROM public.company_notification_recipients(NEW.company_id) LOOP
    PERFORM public.enqueue_notification_workflow(
      'offer_response_company', recipient.user_id, recipient.email, 'offer-response:' || NEW.id::text || ':' || NEW.status,
      NEW.company_id, NEW.officer_id, NEW.hiring_application_id, NEW.id, NEW.hire_id, NULL,
      jsonb_build_object('officer_name', coalesce(officer_name, 'Security professional'), 'company_name', company_name, 'position', coalesce(NEW.terms->>'positionTitle', 'Security Officer'), 'response', NEW.status), now()
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_offer_response_company_notification_on_offer ON public.employment_offers;
CREATE TRIGGER queue_offer_response_company_notification_on_offer
AFTER UPDATE OF status ON public.employment_offers
FOR EACH ROW EXECUTE FUNCTION public.queue_offer_response_company_notification();

CREATE OR REPLACE FUNCTION public.queue_hire_confirmation_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE officer_record record; company_name text;
BEGIN
  IF OLD.employment_confirmed_at IS NOT NULL OR NEW.employment_confirmed_at IS NULL THEN RETURN NEW; END IF;
  SELECT officer.user_id, profile.email, profile.full_name INTO officer_record FROM public.officer_profiles officer JOIN public.profiles profile ON profile.id = officer.user_id WHERE officer.id = NEW.officer_id;
  SELECT company.company_name INTO company_name FROM public.company_profiles company WHERE company.id = NEW.company_id;
  PERFORM public.enqueue_notification_workflow(
    'hire_confirmed_officer', officer_record.user_id, officer_record.email, 'hire-confirmed:' || NEW.id::text,
    NEW.company_id, NEW.officer_id, NEW.hiring_application_id, NULL, NEW.id, NULL,
    jsonb_build_object('officer_name', coalesce(officer_record.full_name, 'Security professional'), 'company_name', company_name, 'position', coalesce(NEW.offer_terms->>'positionTitle', 'Security Officer')), now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_hire_confirmation_notification_on_hire ON public.hires;
CREATE TRIGGER queue_hire_confirmation_notification_on_hire
AFTER UPDATE OF employment_confirmed_at ON public.hires
FOR EACH ROW EXECUTE FUNCTION public.queue_hire_confirmation_notification();
