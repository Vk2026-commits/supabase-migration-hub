-- Interview acceptance and actual attendance are separate facts. Only a
-- company owner or active team member may confirm attendance after the
-- scheduled start time.
ALTER TABLE public.interview_schedules
  ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending', 'attended', 'no_show')),
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attendance_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- The earlier archival job must never infer attendance from acceptance.
CREATE OR REPLACE FUNCTION public.archive_past_interviews()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.interview_schedules AS interview
  SET status = 'completed', updated_at = now()
  WHERE interview.status = 'scheduled'
    AND interview.attendance_status IN ('attended', 'no_show')
    AND (interview.scheduled_at AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date
        < (now() AT TIME ZONE coalesce(nullif(interview.timezone, ''), 'America/Chicago'))::date;
$$;

CREATE OR REPLACE FUNCTION public.record_interview_attendance(
  _interview_id uuid,
  _attendance_status text
)
RETURNS public.interview_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.interview_schedules;
BEGIN
  IF _attendance_status NOT IN ('attended', 'no_show') THEN
    RAISE EXCEPTION 'Choose attended or no-show';
  END IF;

  UPDATE public.interview_schedules AS interview
  SET attendance_status = _attendance_status,
      attendance_confirmed_at = now(),
      attendance_confirmed_by = auth.uid(),
      status = 'completed',
      updated_at = now()
  WHERE interview.id = _interview_id
    AND interview.status <> 'cancelled'
    AND interview.response_status = 'accepted'
    AND interview.scheduled_at <= now()
    AND (
      EXISTS (
        SELECT 1 FROM public.company_profiles company
        WHERE company.id = interview.company_id AND company.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.company_members member
        WHERE member.company_id = interview.company_id
          AND member.user_id = auth.uid()
          AND member.status = 'active'
      )
    )
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Attendance can only be confirmed by the company after an accepted interview begins';
  END IF;

  IF _attendance_status = 'attended' THEN
    UPDATE public.job_applications
    SET status = 'interview_completed', updated_at = now()
    WHERE id = result.job_application_id
      AND status NOT IN ('accepted', 'offer_sent');
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_interview_attendance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_interview_attendance(uuid, text) TO authenticated;

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
        'attendance_status', interview.attendance_status,
        'attendance_confirmed_at', interview.attendance_confirmed_at,
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

