-- Preserve confirmed interview details until the other party accepts a
-- reschedule. Cancellations are immediate, auditable, and dismissible by the
-- party receiving the notice.
ALTER TABLE public.interview_schedules
  ADD COLUMN IF NOT EXISTS change_request_type text
    CHECK (change_request_type IS NULL OR change_request_type IN ('reschedule', 'cancel')),
  ADD COLUMN IF NOT EXISTS change_requested_by text
    CHECK (change_requested_by IS NULL OR change_requested_by IN ('company', 'officer')),
  ADD COLUMN IF NOT EXISTS change_request_status text
    CHECK (change_request_status IS NULL OR change_request_status IN ('pending', 'accepted', 'declined')),
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS change_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS change_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_interview_type text
    CHECK (proposed_interview_type IS NULL OR proposed_interview_type IN ('video', 'in_person')),
  ADD COLUMN IF NOT EXISTS proposed_location text,
  ADD COLUMN IF NOT EXISTS proposed_meeting_url text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text
    CHECK (cancelled_by IS NULL OR cancelled_by IN ('company', 'officer')),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_officer_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_company_dismissed_at timestamptz;

CREATE OR REPLACE FUNCTION public.request_interview_change(
  _interview_id uuid,
  _request_type text,
  _reason text,
  _proposed_scheduled_at timestamptz DEFAULT NULL,
  _proposed_interview_type text DEFAULT NULL,
  _proposed_location text DEFAULT NULL,
  _proposed_meeting_url text DEFAULT NULL
)
RETURNS public.interview_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text;
  result public.interview_schedules;
BEGIN
  IF _request_type NOT IN ('reschedule', 'cancel') THEN
    RAISE EXCEPTION 'Choose reschedule or cancel';
  END IF;
  IF nullif(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Add a reason for this change';
  END IF;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.officer_profiles officer
      WHERE officer.id = interview.officer_id AND officer.user_id = auth.uid()
    ) THEN 'officer'
    WHEN EXISTS (
      SELECT 1 FROM public.company_profiles company
      WHERE company.id = interview.company_id AND company.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.company_members member
      WHERE member.company_id = interview.company_id
        AND member.user_id = auth.uid() AND member.status = 'active'
    ) THEN 'company'
    ELSE NULL
  END INTO actor
  FROM public.interview_schedules interview
  WHERE interview.id = _interview_id
    AND (
      EXISTS (SELECT 1 FROM public.officer_profiles officer WHERE officer.id = interview.officer_id AND officer.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = interview.company_id AND company.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = interview.company_id AND member.user_id = auth.uid() AND member.status = 'active')
    );

  IF actor IS NULL THEN RAISE EXCEPTION 'You cannot change this interview'; END IF;

  IF _request_type = 'cancel' THEN
    UPDATE public.interview_schedules interview
    SET status = 'cancelled',
        change_request_type = 'cancel',
        change_requested_by = actor,
        change_request_status = 'accepted',
        change_reason = btrim(_reason),
        change_requested_at = now(),
        change_responded_at = now(),
        cancellation_reason = btrim(_reason),
        cancelled_by = actor,
        cancelled_at = now(),
        cancellation_officer_dismissed_at = CASE WHEN actor = 'officer' THEN now() ELSE NULL END,
        cancellation_company_dismissed_at = CASE WHEN actor = 'company' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE interview.id = _interview_id
      AND interview.status = 'scheduled'
      AND interview.scheduled_at > now()
    RETURNING * INTO result;
  ELSE
    IF _proposed_scheduled_at IS NULL OR _proposed_scheduled_at <= now() THEN
      RAISE EXCEPTION 'Choose a future interview time';
    END IF;
    IF _proposed_interview_type NOT IN ('video', 'in_person') THEN
      RAISE EXCEPTION 'Choose an interview format';
    END IF;
    IF _proposed_interview_type = 'video' AND nullif(btrim(_proposed_meeting_url), '') IS NULL THEN
      RAISE EXCEPTION 'Add the video meeting link';
    END IF;
    IF _proposed_interview_type = 'in_person' AND nullif(btrim(_proposed_location), '') IS NULL THEN
      RAISE EXCEPTION 'Add the interview location';
    END IF;

    UPDATE public.interview_schedules interview
    SET change_request_type = 'reschedule',
        change_requested_by = actor,
        change_request_status = 'pending',
        change_reason = btrim(_reason),
        change_requested_at = now(),
        change_responded_at = NULL,
        proposed_scheduled_at = _proposed_scheduled_at,
        proposed_interview_type = _proposed_interview_type,
        proposed_location = CASE WHEN _proposed_interview_type = 'in_person' THEN nullif(btrim(_proposed_location), '') ELSE NULL END,
        proposed_meeting_url = CASE WHEN _proposed_interview_type = 'video' THEN nullif(btrim(_proposed_meeting_url), '') ELSE NULL END,
        updated_at = now()
    WHERE interview.id = _interview_id
      AND interview.status = 'scheduled'
      AND interview.scheduled_at > now()
    RETURNING * INTO result;
  END IF;

  IF result.id IS NULL THEN RAISE EXCEPTION 'This interview can no longer be changed'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.request_interview_change(uuid, text, text, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_interview_change(uuid, text, text, timestamptz, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_interview_change(_interview_id uuid, _decision text)
RETURNS public.interview_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text;
  result public.interview_schedules;
BEGIN
  IF _decision NOT IN ('accepted', 'declined') THEN RAISE EXCEPTION 'Choose accept or decline'; END IF;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.officer_profiles officer
      WHERE officer.id = interview.officer_id AND officer.user_id = auth.uid()
    ) THEN 'officer'
    WHEN EXISTS (
      SELECT 1 FROM public.company_profiles company
      WHERE company.id = interview.company_id AND company.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.company_members member
      WHERE member.company_id = interview.company_id
        AND member.user_id = auth.uid() AND member.status = 'active'
    ) THEN 'company'
    ELSE NULL
  END INTO actor
  FROM public.interview_schedules interview
  WHERE interview.id = _interview_id
    AND (
      EXISTS (SELECT 1 FROM public.officer_profiles officer WHERE officer.id = interview.officer_id AND officer.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = interview.company_id AND company.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = interview.company_id AND member.user_id = auth.uid() AND member.status = 'active')
    );

  UPDATE public.interview_schedules interview
  SET scheduled_at = CASE WHEN _decision = 'accepted' THEN interview.proposed_scheduled_at ELSE interview.scheduled_at END,
      interview_type = CASE WHEN _decision = 'accepted' THEN interview.proposed_interview_type ELSE interview.interview_type END,
      location = CASE WHEN _decision = 'accepted' THEN interview.proposed_location ELSE interview.location END,
      meeting_url = CASE WHEN _decision = 'accepted' THEN interview.proposed_meeting_url ELSE interview.meeting_url END,
      response_status = CASE WHEN _decision = 'accepted' THEN 'accepted' ELSE interview.response_status END,
      responded_at = CASE WHEN _decision = 'accepted' THEN now() ELSE interview.responded_at END,
      change_request_status = _decision,
      change_responded_at = now(),
      updated_at = now()
  WHERE interview.id = _interview_id
    AND interview.status = 'scheduled'
    AND interview.change_request_type = 'reschedule'
    AND interview.change_request_status = 'pending'
    AND interview.change_requested_by <> actor
    AND actor IN ('company', 'officer')
  RETURNING * INTO result;

  IF result.id IS NULL THEN RAISE EXCEPTION 'This reschedule request is no longer available'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_interview_change(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_interview_change(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_interview_notice(_interview_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.interview_schedules interview
  SET cancellation_officer_dismissed_at = CASE
        WHEN EXISTS (SELECT 1 FROM public.officer_profiles officer WHERE officer.id = interview.officer_id AND officer.user_id = auth.uid())
        THEN now() ELSE interview.cancellation_officer_dismissed_at END,
      cancellation_company_dismissed_at = CASE
        WHEN EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = interview.company_id AND company.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = interview.company_id AND member.user_id = auth.uid() AND member.status = 'active')
        THEN now() ELSE interview.cancellation_company_dismissed_at END,
      updated_at = now()
  WHERE interview.id = _interview_id
    AND (
      EXISTS (SELECT 1 FROM public.officer_profiles officer WHERE officer.id = interview.officer_id AND officer.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = interview.company_id AND company.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = interview.company_id AND member.user_id = auth.uid() AND member.status = 'active')
    );

  IF NOT FOUND THEN RAISE EXCEPTION 'Interview notice was not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_interview_notice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_interview_notice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_upcoming_interview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', interview.id,
    'company_id', interview.company_id,
    'officer_id', interview.officer_id,
    'job_application_id', interview.job_application_id,
    'interview_type', interview.interview_type,
    'scheduled_at', interview.scheduled_at,
    'timezone', interview.timezone,
    'location', interview.location,
    'meeting_url', interview.meeting_url,
    'notes', interview.notes,
    'status', interview.status,
    'response_status', interview.response_status,
    'responded_at', interview.responded_at,
    'change_request_type', interview.change_request_type,
    'change_requested_by', interview.change_requested_by,
    'change_request_status', interview.change_request_status,
    'change_reason', interview.change_reason,
    'proposed_scheduled_at', interview.proposed_scheduled_at,
    'proposed_interview_type', interview.proposed_interview_type,
    'proposed_location', interview.proposed_location,
    'proposed_meeting_url', interview.proposed_meeting_url,
    'cancellation_reason', interview.cancellation_reason,
    'cancelled_by', interview.cancelled_by,
    'company_name', company.company_name,
    'job_title', posting.title
  )
  FROM public.interview_schedules interview
  JOIN public.officer_profiles officer ON officer.id = interview.officer_id
  JOIN public.company_profiles company ON company.id = interview.company_id
  JOIN public.job_applications application ON application.id = interview.job_application_id
  JOIN public.job_postings posting ON posting.id = application.job_posting_id
  WHERE officer.user_id = auth.uid()
    AND (
      (interview.status = 'scheduled' AND
       (interview.scheduled_at AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date
         >= (now() AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date)
      OR (interview.status = 'cancelled' AND interview.cancelled_by = 'company' AND interview.cancellation_officer_dismissed_at IS NULL)
    )
  ORDER BY CASE WHEN interview.status = 'cancelled' THEN 0 ELSE 1 END, interview.updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_upcoming_interview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_upcoming_interview() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_interview_history()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', interview.id,
    'interview_type', interview.interview_type,
    'scheduled_at', interview.scheduled_at,
    'timezone', interview.timezone,
    'location', interview.location,
    'meeting_url', interview.meeting_url,
    'notes', interview.notes,
    'status', interview.status,
    'response_status', interview.response_status,
    'attendance_status', interview.attendance_status,
    'attendance_confirmed_at', interview.attendance_confirmed_at,
    'cancellation_reason', interview.cancellation_reason,
    'cancelled_by', interview.cancelled_by,
    'company_name', company.company_name,
    'job_title', posting.title
  ) ORDER BY interview.scheduled_at DESC), '[]'::jsonb)
  FROM public.interview_schedules interview
  JOIN public.officer_profiles officer ON officer.id = interview.officer_id
  JOIN public.company_profiles company ON company.id = interview.company_id
  JOIN public.job_applications application ON application.id = interview.job_application_id
  JOIN public.job_postings posting ON posting.id = application.job_posting_id
  WHERE officer.user_id = auth.uid()
    AND (interview.scheduled_at AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date
      < (now() AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date;
$$;

REVOKE ALL ON FUNCTION public.get_my_interview_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_interview_history() TO authenticated;

ALTER TABLE public.notification_workflows DROP CONSTRAINT IF EXISTS notification_workflows_kind_check;
ALTER TABLE public.notification_workflows ADD CONSTRAINT notification_workflows_kind_check CHECK (kind IN (
  'application_reminder', 'application_submitted_officer', 'application_submitted_company',
  'offer_action', 'offer_response_company', 'onboarding_action',
  'onboarding_submitted_officer', 'onboarding_submitted_company',
  'interview_scheduled_officer', 'interview_updated_officer', 'interview_cancelled_officer',
  'interview_cancelled_company', 'interview_confirmed_officer', 'interview_response_company',
  'interview_change_requested_officer', 'interview_change_requested_company',
  'interview_change_response_officer', 'interview_change_response_company',
  'hire_confirmed_officer'
));

CREATE OR REPLACE FUNCTION public.queue_interview_workflow_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  officer_record record;
  company_name text;
  recipient record;
  job_title text;
  notification_context jsonb;
BEGIN
  SELECT officer.user_id, profile.email, profile.full_name INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  SELECT company.company_name, posting.title INTO company_name, job_title
  FROM public.company_profiles company
  LEFT JOIN public.job_applications application ON application.id = NEW.job_application_id
  LEFT JOIN public.job_postings posting ON posting.id = application.job_posting_id
  WHERE company.id = NEW.company_id;

  IF officer_record.user_id IS NULL THEN RETURN NEW; END IF;

  notification_context := jsonb_build_object(
    'interview_id', NEW.id,
    'officer_name', coalesce(officer_record.full_name, 'Security professional'),
    'company_name', coalesce(company_name, 'the hiring company'),
    'position', coalesce(job_title, 'Security Officer'),
    'scheduled_at', NEW.scheduled_at,
    'interview_type', NEW.interview_type,
    'timezone', NEW.timezone,
    'location', NEW.location,
    'meeting_url', NEW.meeting_url,
    'notes', NEW.notes,
    'change_reason', NEW.change_reason,
    'proposed_scheduled_at', NEW.proposed_scheduled_at,
    'proposed_interview_type', NEW.proposed_interview_type,
    'proposed_location', NEW.proposed_location,
    'proposed_meeting_url', NEW.proposed_meeting_url,
    'decision', NEW.change_request_status,
    'cancelled_by', NEW.cancelled_by,
    'cancellation_reason', NEW.cancellation_reason
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_notification_workflow(
      'interview_scheduled_officer', officer_record.user_id, officer_record.email,
      'interview-scheduled:' || NEW.id::text,
      NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
    );
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    IF NEW.cancelled_by = 'company' THEN
      PERFORM public.enqueue_notification_workflow(
        'interview_cancelled_officer', officer_record.user_id, officer_record.email,
        'interview-cancelled:' || NEW.id::text || ':company',
        NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
      );
    ELSE
      FOR recipient IN SELECT * FROM public.company_notification_recipients(NEW.company_id) LOOP
        PERFORM public.enqueue_notification_workflow(
          'interview_cancelled_company', recipient.user_id, recipient.email,
          'interview-cancelled:' || NEW.id::text || ':officer',
          NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
        );
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.change_request_type = 'reschedule'
     AND NEW.change_request_status = 'pending'
     AND (OLD.change_request_status IS DISTINCT FROM NEW.change_request_status
       OR OLD.change_requested_at IS DISTINCT FROM NEW.change_requested_at) THEN
    IF NEW.change_requested_by = 'company' THEN
      PERFORM public.enqueue_notification_workflow(
        'interview_change_requested_officer', officer_record.user_id, officer_record.email,
        'interview-change-request:' || NEW.id::text || ':' || extract(epoch from NEW.change_requested_at)::bigint::text,
        NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
      );
    ELSE
      FOR recipient IN SELECT * FROM public.company_notification_recipients(NEW.company_id) LOOP
        PERFORM public.enqueue_notification_workflow(
          'interview_change_requested_company', recipient.user_id, recipient.email,
          'interview-change-request:' || NEW.id::text || ':' || extract(epoch from NEW.change_requested_at)::bigint::text,
          NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
        );
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.change_request_status IS DISTINCT FROM NEW.change_request_status
     AND NEW.change_request_status IN ('accepted', 'declined')
     AND NEW.change_request_type = 'reschedule' THEN
    IF NEW.change_requested_by = 'company' THEN
      FOR recipient IN SELECT * FROM public.company_notification_recipients(NEW.company_id) LOOP
        PERFORM public.enqueue_notification_workflow(
          'interview_change_response_company', recipient.user_id, recipient.email,
          'interview-change-response:' || NEW.id::text || ':' || NEW.change_request_status || ':' || extract(epoch from NEW.change_responded_at)::bigint::text,
          NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
        );
      END LOOP;
    ELSE
      PERFORM public.enqueue_notification_workflow(
        'interview_change_response_officer', officer_record.user_id, officer_record.email,
        'interview-change-response:' || NEW.id::text || ':' || NEW.change_request_status || ':' || extract(epoch from NEW.change_responded_at)::bigint::text,
        NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL, notification_context, now()
      );
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.response_status IS DISTINCT FROM NEW.response_status
     AND NEW.response_status IN ('accepted', 'declined') THEN
    IF NEW.response_status = 'accepted' THEN
      PERFORM public.enqueue_notification_workflow(
        'interview_confirmed_officer', officer_record.user_id, officer_record.email,
        'interview-confirmed:' || NEW.id::text,
        NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL,
        notification_context || jsonb_build_object('response', NEW.response_status), now()
      );
    END IF;
    FOR recipient IN SELECT * FROM public.company_notification_recipients(NEW.company_id) LOOP
      PERFORM public.enqueue_notification_workflow(
        'interview_response_company', recipient.user_id, recipient.email,
        'interview-response:' || NEW.id::text || ':' || NEW.response_status,
        NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL,
        notification_context || jsonb_build_object('response', NEW.response_status), now()
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
