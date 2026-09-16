-- An interview stops being "upcoming" once its scheduled time passes. It is
-- shown in officer history immediately, while the company can still record
-- attended/no-show afterward.
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
      (interview.status = 'scheduled' AND interview.scheduled_at > now())
      OR (
        interview.status = 'cancelled'
        AND interview.cancelled_by = 'company'
        AND interview.cancellation_officer_dismissed_at IS NULL
      )
    )
  ORDER BY CASE WHEN interview.status = 'cancelled' THEN 0 ELSE 1 END,
           interview.scheduled_at ASC,
           interview.updated_at DESC
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
    AND interview.scheduled_at <= now();
$$;

REVOKE ALL ON FUNCTION public.get_my_interview_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_interview_history() TO authenticated;

COMMENT ON FUNCTION public.get_my_upcoming_interview() IS
  'Returns only a future interview or an undismissed company cancellation notice for the signed-in officer.';

COMMENT ON FUNCTION public.get_my_interview_history() IS
  'Returns interviews once their scheduled timestamp has passed, regardless of the eventual hiring result.';
