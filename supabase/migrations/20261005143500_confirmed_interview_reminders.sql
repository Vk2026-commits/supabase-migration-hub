-- Keep expired-response notices relevant to the latest interview and send only
-- confirmed officers the reminders they need to attend.
ALTER TABLE public.notification_workflows
  DROP CONSTRAINT IF EXISTS notification_workflows_kind_check;

ALTER TABLE public.notification_workflows
  ADD CONSTRAINT notification_workflows_kind_check CHECK (kind IN (
    'application_reminder', 'application_submitted_officer', 'application_submitted_company',
    'application_not_selected_officer',
    'offer_action', 'offer_response_company', 'onboarding_action',
    'onboarding_submitted_officer', 'onboarding_submitted_company',
    'interview_scheduled_officer', 'interview_updated_officer', 'interview_cancelled_officer',
    'interview_cancelled_company', 'interview_confirmed_officer', 'interview_response_company',
    'interview_change_requested_officer', 'interview_change_requested_company',
    'interview_change_response_officer', 'interview_change_response_company',
    'interview_reminder_day_before_officer', 'interview_reminder_one_hour_officer',
    'hire_confirmed_officer'
  ));

CREATE OR REPLACE FUNCTION public.sync_interview_reminder_workflows(_interview_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  interview_record record;
  officer_record record;
  notification_context jsonb;
  event_version text;
BEGIN
  SELECT
    interview.id,
    interview.company_id,
    interview.officer_id,
    interview.status,
    interview.response_status,
    interview.scheduled_at,
    interview.timezone,
    interview.interview_type,
    interview.location,
    interview.meeting_url,
    interview.notes,
    interview.updated_at,
    company.company_name,
    posting.title AS job_title
  INTO interview_record
  FROM public.interview_schedules interview
  JOIN public.company_profiles company ON company.id = interview.company_id
  LEFT JOIN public.job_applications application ON application.id = interview.job_application_id
  LEFT JOIN public.job_postings posting ON posting.id = application.job_posting_id
  WHERE interview.id = _interview_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT officer.user_id, profile.email, profile.full_name
  INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = interview_record.officer_id;

  IF officer_record.user_id IS NULL OR coalesce(trim(officer_record.email), '') = '' THEN
    RETURN;
  END IF;

  -- Any changed, canceled, expired, or no-longer-accepted interview invalidates
  -- future reminders that were queued for its former appointment time.
  UPDATE public.notification_workflows
  SET status = 'cancelled',
      completed_at = now(),
      next_send_at = NULL,
      updated_at = now()
  WHERE recipient_user_id = officer_record.user_id
    AND kind IN ('interview_reminder_day_before_officer', 'interview_reminder_one_hour_officer')
    AND status = 'active'
    AND context->>'interview_id' = interview_record.id::text;

  IF interview_record.status <> 'scheduled'
     OR interview_record.response_status <> 'accepted'
     OR interview_record.scheduled_at <= now() THEN
    RETURN;
  END IF;

  notification_context := jsonb_build_object(
    'interview_id', interview_record.id,
    'officer_name', coalesce(officer_record.full_name, 'Security professional'),
    'company_name', coalesce(interview_record.company_name, 'the hiring company'),
    'position', coalesce(interview_record.job_title, 'Security Officer'),
    'scheduled_at', interview_record.scheduled_at,
    'timezone', interview_record.timezone,
    'interview_type', interview_record.interview_type,
    'location', interview_record.location,
    'meeting_url', interview_record.meeting_url,
    'notes', interview_record.notes
  );
  event_version := extract(epoch FROM coalesce(interview_record.updated_at, now()))::bigint::text;

  IF interview_record.scheduled_at > now() + interval '1 day' THEN
    PERFORM public.enqueue_notification_workflow(
      'interview_reminder_day_before_officer', officer_record.user_id, officer_record.email,
      'interview-reminder-day-before:' || interview_record.id::text || ':' || event_version,
      interview_record.company_id, interview_record.officer_id, NULL, NULL, NULL, NULL,
      notification_context, interview_record.scheduled_at - interval '1 day'
    );
  END IF;

  IF interview_record.scheduled_at > now() + interval '1 hour' THEN
    PERFORM public.enqueue_notification_workflow(
      'interview_reminder_one_hour_officer', officer_record.user_id, officer_record.email,
      'interview-reminder-one-hour:' || interview_record.id::text || ':' || event_version,
      interview_record.company_id, interview_record.officer_id, NULL, NULL, NULL, NULL,
      notification_context, interview_record.scheduled_at - interval '1 hour'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_interview_reminder_workflows(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_interview_reminders_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_interview_reminder_workflows(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_interview_reminders_on_change ON public.interview_schedules;
CREATE TRIGGER sync_interview_reminders_on_change
AFTER INSERT OR UPDATE OF status, response_status, scheduled_at
ON public.interview_schedules
FOR EACH ROW EXECUTE FUNCTION public.sync_interview_reminders_on_change();

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
    AND NOT EXISTS (
      SELECT 1
      FROM public.interview_schedules AS newer
      WHERE newer.officer_id = interview.officer_id
        AND newer.id <> interview.id
        AND newer.response_status = 'accepted'
        AND coalesce(newer.responded_at, newer.updated_at) > interview.response_expired_at
    )
  ORDER BY interview.response_expired_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_recent_expired_interview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_recent_expired_interview() TO authenticated;

-- Add the reminders for any future interview that was already accepted before
-- this release, without sending reminders for historical appointments.
SELECT public.sync_interview_reminder_workflows(interview.id)
FROM public.interview_schedules AS interview
WHERE interview.status = 'scheduled'
  AND interview.response_status = 'accepted'
  AND interview.scheduled_at > now();

-- Five-minute dispatch precision keeps the one-hour reminder close to its intended time.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'dispatch-workflow-notifications';

SELECT cron.schedule(
  'dispatch-workflow-notifications',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_project_url') || '/functions/v1/send-workflow-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_publishable_key'),
        'x-notification-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_cron_secret')
      ),
      body := jsonb_build_object('action', 'dispatch')
    );
  $cron$
);
