-- Give an officer the display details for only their own next interview.
-- This avoids granting access to the hiring company's full profile row, which
-- contains contact and account fields that are not needed on the banner.
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
    AND interview.scheduled_at >= now()
  ORDER BY interview.scheduled_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_upcoming_interview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_upcoming_interview() TO authenticated;

COMMENT ON FUNCTION public.get_my_upcoming_interview() IS
  'Returns the signed-in officer''s next interview with safe company and job display names.';
