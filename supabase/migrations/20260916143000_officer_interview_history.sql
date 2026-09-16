-- Keep the active interview visible through the end of its scheduled local
-- day, then retain it as a permanent officer history record.
CREATE OR REPLACE FUNCTION public.archive_past_interviews()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.interview_schedules AS interview
  SET status = 'completed', updated_at = now()
  WHERE interview.status = 'scheduled'
    AND interview.response_status = 'accepted'
    AND (interview.scheduled_at AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date
        < (now() AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date;
$$;

REVOKE ALL ON FUNCTION public.archive_past_interviews() FROM PUBLIC;

SELECT cron.schedule(
  'archive-past-interviews-hourly',
  '5 * * * *',
  $$SELECT public.archive_past_interviews();$$
);

-- Archive any interviews that already qualify when this migration is applied.
SELECT public.archive_past_interviews();

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
    'company_name', company.company_name,
    'job_title', posting.title
  )
  FROM public.interview_schedules AS interview
  JOIN public.officer_profiles AS officer ON officer.id = interview.officer_id
  JOIN public.company_profiles AS company ON company.id = interview.company_id
  JOIN public.job_applications AS application ON application.id = interview.job_application_id
  JOIN public.job_postings AS posting ON posting.id = application.job_posting_id
  WHERE officer.user_id = auth.uid()
    AND interview.status = 'scheduled'
    AND (interview.scheduled_at AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date
        >= (now() AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date
  ORDER BY interview.scheduled_at ASC
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
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', interview.id,
        'interview_type', interview.interview_type,
        'scheduled_at', interview.scheduled_at,
        'timezone', interview.timezone,
        'location', interview.location,
        'meeting_url', interview.meeting_url,
        'notes', interview.notes,
        'status', interview.status,
        'response_status', interview.response_status,
        'company_name', company.company_name,
        'job_title', posting.title
      ) ORDER BY interview.scheduled_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.interview_schedules AS interview
  JOIN public.officer_profiles AS officer ON officer.id = interview.officer_id
  JOIN public.company_profiles AS company ON company.id = interview.company_id
  JOIN public.job_applications AS application ON application.id = interview.job_application_id
  JOIN public.job_postings AS posting ON posting.id = application.job_posting_id
  WHERE officer.user_id = auth.uid()
    AND (interview.scheduled_at AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date
        < (now() AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date;
$$;

REVOKE ALL ON FUNCTION public.get_my_interview_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_interview_history() TO authenticated;

COMMENT ON FUNCTION public.get_my_interview_history() IS
  'Returns the signed-in officer''s permanent past interview history with safe company and job display fields.';

