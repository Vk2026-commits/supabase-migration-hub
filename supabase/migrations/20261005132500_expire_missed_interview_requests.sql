-- A pending interview request must not remain actionable after its scheduled start.
-- Record the missed response, notify the company, and allow the company to send a
-- brand-new interview request instead of leaving a permanent pending state.
ALTER TABLE public.interview_schedules
  ADD COLUMN IF NOT EXISTS response_expired_at timestamptz;

ALTER TABLE public.interview_schedules
  DROP CONSTRAINT IF EXISTS interview_schedules_status_check;
ALTER TABLE public.interview_schedules
  ADD CONSTRAINT interview_schedules_status_check
  CHECK (status IN ('scheduled', 'completed', 'cancelled', 'expired'));

ALTER TABLE public.interview_schedules
  DROP CONSTRAINT IF EXISTS interview_schedules_response_status_check;
ALTER TABLE public.interview_schedules
  ADD CONSTRAINT interview_schedules_response_status_check
  CHECK (response_status IN ('pending', 'accepted', 'declined', 'expired'));

CREATE INDEX IF NOT EXISTS idx_interview_schedules_pending_response_expiry
  ON public.interview_schedules(scheduled_at)
  WHERE status = 'scheduled' AND response_status = 'pending';

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
     AND NEW.response_status IN ('accepted', 'declined', 'expired') THEN
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

CREATE OR REPLACE FUNCTION public.expire_missed_interview_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.interview_schedules AS interview
    SET status = 'expired',
        response_status = 'expired',
        response_expired_at = COALESCE(interview.response_expired_at, now()),
        updated_at = now()
    WHERE interview.status = 'scheduled'
      AND interview.response_status = 'pending'
      AND interview.scheduled_at <= now()
    RETURNING interview.id
  ), retired_workflows AS (
    UPDATE public.notification_workflows AS workflow
    SET status = 'completed',
        completed_at = now(),
        next_send_at = NULL,
        updated_at = now()
    WHERE workflow.status IN ('active', 'delivered')
      AND workflow.kind IN ('interview_scheduled_officer', 'interview_updated_officer')
      AND EXISTS (
        SELECT 1 FROM expired
        WHERE (workflow.context->>'interview_id') = expired.id::text
      )
    RETURNING workflow.id
  )
  SELECT count(*)::integer INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_missed_interview_requests() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_recent_expired_interview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', interview.id,
    'scheduled_at', interview.scheduled_at,
    'response_expired_at', interview.response_expired_at,
    'company_name', company.company_name,
    'job_title', posting.title
  )
  FROM public.interview_schedules AS interview
  JOIN public.officer_profiles AS officer ON officer.id = interview.officer_id
  JOIN public.company_profiles AS company ON company.id = interview.company_id
  JOIN public.job_applications AS application ON application.id = interview.job_application_id
  JOIN public.job_postings AS posting ON posting.id = application.job_posting_id
  WHERE officer.user_id = auth.uid()
    AND interview.status = 'expired'
    AND interview.response_status = 'expired'
    AND interview.response_expired_at >= now() - interval '14 days'
  ORDER BY interview.response_expired_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_recent_expired_interview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_recent_expired_interview() TO authenticated;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'expire-missed-interview-requests';

SELECT cron.schedule(
  'expire-missed-interview-requests',
  '*/15 * * * *',
  $$SELECT public.expire_missed_interview_requests();$$
);

-- Bring already-past pending requests into the same final, auditable state.
SELECT public.expire_missed_interview_requests();
