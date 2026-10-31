ALTER TABLE public.interview_schedules ADD COLUMN IF NOT EXISTS attendance_reason text;
CREATE OR REPLACE FUNCTION public.record_interview_attendance(_interview_id uuid, _attendance_status text, _reason text)
RETURNS public.interview_schedules LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result public.interview_schedules;
BEGIN
 IF _attendance_status = 'no_show' AND nullif(trim(_reason), '') IS NULL THEN RAISE EXCEPTION 'Provide the no-show reason'; END IF;
 -- The established two-argument function enforces company membership, accepted response, and elapsed start time.
 result := public.record_interview_attendance(_interview_id, _attendance_status);
 UPDATE public.interview_schedules SET attendance_reason = nullif(trim(_reason), '') WHERE id = result.id RETURNING * INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_interview_attendance(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_interview_attendance(uuid,text,text) TO authenticated;
