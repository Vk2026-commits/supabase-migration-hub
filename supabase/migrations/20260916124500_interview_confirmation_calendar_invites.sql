-- Send a complete confirmation to both parties when an officer accepts an
-- interview. The notification worker attaches a standards-based calendar
-- invitation using this context.
ALTER TABLE public.notification_workflows
  DROP CONSTRAINT IF EXISTS notification_workflows_kind_check;

ALTER TABLE public.notification_workflows
  ADD CONSTRAINT notification_workflows_kind_check CHECK (kind IN (
    'application_reminder', 'application_submitted_officer', 'application_submitted_company',
    'offer_action', 'offer_response_company', 'onboarding_action',
    'onboarding_submitted_officer', 'onboarding_submitted_company',
    'interview_scheduled_officer', 'interview_updated_officer', 'interview_cancelled_officer',
    'interview_confirmed_officer', 'interview_response_company', 'hire_confirmed_officer'
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
  event_kind text;
  event_key text;
  notification_context jsonb;
BEGIN
  SELECT officer.user_id, profile.email, profile.full_name
  INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  SELECT company.company_name, posting.title
  INTO company_name, job_title
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
    'notes', NEW.notes
  );

  IF TG_OP = 'INSERT' THEN
    event_kind := 'interview_scheduled_officer';
    event_key := 'interview-scheduled:' || NEW.id::text;
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
    event_kind := 'interview_cancelled_officer';
    event_key := 'interview-cancelled:' || NEW.id::text;
  ELSIF OLD.response_status IS DISTINCT FROM NEW.response_status
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
    RETURN NEW;
  ELSIF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
      OR OLD.interview_type IS DISTINCT FROM NEW.interview_type
      OR OLD.meeting_url IS DISTINCT FROM NEW.meeting_url
      OR OLD.location IS DISTINCT FROM NEW.location
      OR OLD.notes IS DISTINCT FROM NEW.notes THEN
    event_kind := 'interview_updated_officer';
    event_key := 'interview-updated:' || NEW.id::text || ':' || extract(epoch from NEW.updated_at)::bigint::text;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_notification_workflow(
    event_kind, officer_record.user_id, officer_record.email, event_key,
    NEW.company_id, NEW.officer_id, NULL, NULL, NULL, NULL,
    notification_context, now()
  );
  RETURN NEW;
END;
$$;

