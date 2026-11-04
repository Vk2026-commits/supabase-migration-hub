-- Explicit declarations for new submissions. Existing submitted records remain unchanged.
CREATE OR REPLACE FUNCTION public.hiring_declarations_complete(data jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE levels jsonb := data->'licenseLevels';
BEGIN
  IF data IS NULL OR jsonb_typeof(levels) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(levels)=0 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(levels) x(value)
     WHERE value IS NULL OR value NOT IN ('Level II','Level III','Level IV','No license')) THEN RETURN false; END IF;
  IF levels ? 'No license' AND jsonb_array_length(levels) <> 1 THEN RETURN false; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM unnest(ARRAY['isAdult','eligibleToWork','driversLicense']) f
    WHERE coalesce(data->>f,'') NOT IN ('Yes','No'));
END;
$$;
REVOKE ALL ON FUNCTION public.hiring_declarations_complete(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hiring_declarations_complete(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_my_hiring_application(_master_application_id uuid, _officer_id uuid, _job_posting_id uuid, _position text, _applicant_name text, _applicant_email text, _signature_name text, _signature_date date, _application_data jsonb)
 RETURNS TABLE(master_application_id uuid, employer_application_id uuid, job_application_id uuid, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  IF EXISTS(SELECT 1 FROM hiring_test_accounts WHERE officer_id=_officer_id) AND NOT EXISTS(
    SELECT 1 FROM hiring_test_accounts t JOIN guard_hiring_applications a ON a.id=_master_application_id
    WHERE t.officer_id=_officer_id AND a.test_run_id=t.active_run_id AND NOT a.test_archived
      AND _application_data->>'testRunId'=t.active_run_id::text
  ) THEN RAISE EXCEPTION 'Stale test application. Reload before submitting.' USING ERRCODE='40001'; END IF;
  SELECT posting.id, posting.title, company.company_name
  INTO job_record
  FROM public.job_postings posting
  JOIN public.company_profiles company ON company.id = posting.company_id
  WHERE posting.id = _job_posting_id;

  IF job_record.id IS NULL THEN
    RAISE EXCEPTION 'The selected position is no longer available';
  END IF;

  IF NOT public.hiring_declarations_complete(_application_data) THEN
    RAISE EXCEPTION 'Answer each Yes/No eligibility question and select Level 2, Level 3, Level 4, or No license before submitting';
  END IF;

  INSERT INTO public.job_applications (job_posting_id, officer_id, status)
  VALUES (_job_posting_id, _officer_id, 'interested')
  ON CONFLICT (job_posting_id, officer_id) WHERE NOT test_archived DO NOTHING;

  SELECT application.id
  INTO saved_job_application_id
  FROM public.job_applications application
  WHERE application.job_posting_id = _job_posting_id
    AND application.officer_id = _officer_id AND NOT application.test_archived;

  IF _master_application_id IS NOT NULL THEN
    SELECT application.id
    INTO saved_master_id
    FROM public.guard_hiring_applications application
    WHERE application.id = _master_application_id
      AND application.officer_id = _officer_id
      AND application.user_id = requesting_user_id
      AND application.application_type = 'master' AND NOT application.test_archived;
  END IF;

  IF saved_master_id IS NULL THEN
    SELECT application.id
    INTO saved_master_id
    FROM public.guard_hiring_applications application
    WHERE application.officer_id = _officer_id
      AND application.application_type = 'master' AND NOT application.test_archived
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
$function$
;
