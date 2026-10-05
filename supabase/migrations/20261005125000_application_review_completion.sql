-- Record the company acknowledgement that a submitted hiring application was reviewed
-- before it progresses to the interview stage.
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS application_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.job_applications
SET application_reviewed_at = COALESCE(application_reviewed_at, created_at, now())
WHERE status = 'reviewed'
  AND application_reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_applications_company_reviewed
  ON public.job_applications(status, application_reviewed_at DESC)
  WHERE status = 'reviewed';

CREATE OR REPLACE FUNCTION public.mark_job_application_reviewed(_job_application_id uuid)
RETURNS public.job_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.job_applications%ROWTYPE;
  company_id_value uuid;
BEGIN
  SELECT * INTO result
  FROM public.job_applications
  WHERE id = _job_application_id
  FOR UPDATE;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT company_id INTO company_id_value
  FROM public.job_postings
  WHERE id = result.job_posting_id;

  IF NOT public.company_team_has_access(
    company_id_value,
    ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
  ) AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You are not authorized to review this application';
  END IF;

  IF result.status NOT IN ('interested', 'submitted', 'reviewed') THEN
    RAISE EXCEPTION 'Only a new application can be marked as reviewed';
  END IF;

  UPDATE public.job_applications
  SET status = 'reviewed',
      application_reviewed_at = COALESCE(application_reviewed_at, now()),
      application_reviewed_by = COALESCE(application_reviewed_by, auth.uid())
  WHERE id = result.id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_job_application_reviewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_job_application_reviewed(uuid) TO authenticated;

COMMENT ON COLUMN public.job_applications.application_reviewed_at IS
  'Timestamp when an authorized company representative acknowledged completing the hiring application review.';
COMMENT ON FUNCTION public.mark_job_application_reviewed(uuid) IS
  'Advances a company-owned submitted hiring application to reviewed after an authorized acknowledgement.';
