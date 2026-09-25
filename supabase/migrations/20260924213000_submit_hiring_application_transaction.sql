-- Persist the signed master application, the job link, and the employer copy
-- in one short transaction. This replaces a long client-side chain of RLS
-- queries that was vulnerable to statement timeouts when Disk IO was busy.
CREATE OR REPLACE FUNCTION public.submit_my_hiring_application(
  _master_application_id uuid,
  _officer_id uuid,
  _job_posting_id uuid,
  _position text,
  _applicant_name text,
  _applicant_email text,
  _signature_name text,
  _signature_date date,
  _application_data jsonb
)
RETURNS TABLE (
  master_application_id uuid,
  employer_application_id uuid,
  job_application_id uuid,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requesting_user_id uuid := auth.uid();
  job_record record;
  saved_master_id uuid;
  saved_job_application_id uuid;
  saved_employer_application_id uuid;
  submission_time timestamptz := clock_timestamp();
BEGIN
  IF requesting_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.officer_profiles officer
    WHERE officer.id = _officer_id
      AND officer.user_id = requesting_user_id
  ) THEN
    RAISE EXCEPTION 'You are not authorized to submit this application';
  END IF;

  SELECT posting.id, posting.title, company.company_name
  INTO job_record
  FROM public.job_postings posting
  JOIN public.company_profiles company ON company.id = posting.company_id
  WHERE posting.id = _job_posting_id;

  IF job_record.id IS NULL THEN
    RAISE EXCEPTION 'The selected position is no longer available';
  END IF;

  INSERT INTO public.job_applications (job_posting_id, officer_id, status)
  VALUES (_job_posting_id, _officer_id, 'interested')
  ON CONFLICT (job_posting_id, officer_id) DO NOTHING;

  SELECT application.id
  INTO saved_job_application_id
  FROM public.job_applications application
  WHERE application.job_posting_id = _job_posting_id
    AND application.officer_id = _officer_id;

  IF _master_application_id IS NOT NULL THEN
    SELECT application.id
    INTO saved_master_id
    FROM public.guard_hiring_applications application
    WHERE application.id = _master_application_id
      AND application.officer_id = _officer_id
      AND application.user_id = requesting_user_id
      AND application.application_type = 'master';
  END IF;

  IF saved_master_id IS NULL THEN
    SELECT application.id
    INTO saved_master_id
    FROM public.guard_hiring_applications application
    WHERE application.officer_id = _officer_id
      AND application.application_type = 'master'
    ORDER BY application.updated_at DESC
    LIMIT 1;
  END IF;

  IF saved_master_id IS NULL THEN
    INSERT INTO public.guard_hiring_applications (
      officer_id, user_id, application_type, job_application_id,
      company_name, position, applicant_name, applicant_email, status,
      current_step, signature_name, signature_date, submitted_at,
      application_data
    ) VALUES (
      _officer_id, requesting_user_id, 'master', NULL,
      'General We Find Guards Application', _position, _applicant_name,
      _applicant_email, 'submitted', 9, _signature_name, _signature_date,
      submission_time, _application_data
    )
    RETURNING id INTO saved_master_id;
  ELSE
    UPDATE public.guard_hiring_applications application
    SET position = _position,
        applicant_name = _applicant_name,
        applicant_email = _applicant_email,
        status = 'submitted',
        current_step = 9,
        signature_name = _signature_name,
        signature_date = _signature_date,
        submitted_at = submission_time,
        application_data = _application_data
    WHERE application.id = saved_master_id;
  END IF;

  -- If a response was lost after commit, return the matching submitted copy
  -- instead of creating a duplicate when the applicant taps Submit again.
  SELECT application.id
  INTO saved_employer_application_id
  FROM public.guard_hiring_applications application
  WHERE application.source_application_id = saved_master_id
    AND application.job_application_id = saved_job_application_id
    AND application.application_type = 'employer_copy'
    AND application.status = 'submitted'
    AND application.application_data = _application_data
  ORDER BY application.submitted_at DESC, application.created_at DESC
  LIMIT 1;

  IF saved_employer_application_id IS NULL THEN
    SELECT application.id
    INTO saved_employer_application_id
    FROM public.guard_hiring_applications application
    WHERE application.source_application_id = saved_master_id
      AND application.job_application_id = saved_job_application_id
      AND application.application_type = 'employer_copy'
      AND application.status = 'draft'
      AND application.evidence_snapshot_status IN ('pending', 'failed')
    ORDER BY application.created_at DESC
    LIMIT 1;
  END IF;

  IF saved_employer_application_id IS NULL THEN
    INSERT INTO public.guard_hiring_applications (
      officer_id, user_id, application_type, source_application_id,
      job_application_id, company_name, position, applicant_name,
      applicant_email, status, current_step, signature_name, signature_date,
      submitted_at, application_data, evidence_snapshot_status,
      evidence_snapshot_kind
    ) VALUES (
      _officer_id, requesting_user_id, 'employer_copy', saved_master_id,
      saved_job_application_id, job_record.company_name, job_record.title,
      _applicant_name, _applicant_email, 'submitted', 9, _signature_name,
      _signature_date, submission_time, _application_data, 'pending',
      'submission'
    )
    RETURNING id INTO saved_employer_application_id;
  ELSE
    UPDATE public.guard_hiring_applications application
    SET company_name = job_record.company_name,
        position = job_record.title,
        applicant_name = _applicant_name,
        applicant_email = _applicant_email,
        status = 'submitted',
        current_step = 9,
        signature_name = _signature_name,
        signature_date = _signature_date,
        submitted_at = COALESCE(application.submitted_at, submission_time),
        application_data = _application_data,
        evidence_snapshot_status = CASE
          WHEN application.evidence_snapshot_status = 'complete' THEN 'complete'
          ELSE 'pending'
        END,
        evidence_snapshot_kind = 'submission'
    WHERE application.id = saved_employer_application_id;
  END IF;

  RETURN QUERY SELECT
    saved_master_id,
    saved_employer_application_id,
    saved_job_application_id,
    submission_time;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_my_hiring_application(uuid, uuid, uuid, text, text, text, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_my_hiring_application(uuid, uuid, uuid, text, text, text, text, date, jsonb) TO authenticated;

