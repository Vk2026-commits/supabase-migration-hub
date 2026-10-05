-- Add the officer-facing notification for a company decision not to move forward
-- and include the hiring company's location in the application-received confirmation.
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS application_not_selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_not_selected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_not_selected_reason text;

CREATE INDEX IF NOT EXISTS idx_job_applications_not_selected
  ON public.job_applications(application_not_selected_at DESC)
  WHERE status = 'not_selected';

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
    'hire_confirmed_officer'
  ));

CREATE OR REPLACE FUNCTION public.queue_application_submission_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  officer_record record;
  company_record record;
  recipient record;
  notification_context jsonb;
BEGIN
  IF NEW.application_type <> 'employer_copy' OR NEW.status <> 'submitted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT officer.id, officer.user_id, profile.email, profile.full_name
  INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  SELECT company.id,
         company.company_name,
         nullif(concat_ws(', ', nullif(trim(company.company_city), ''), nullif(trim(company.company_state), '')), '') AS company_location
  INTO company_record
  FROM public.job_applications application
  JOIN public.job_postings posting ON posting.id = application.job_posting_id
  JOIN public.company_profiles company ON company.id = posting.company_id
  WHERE application.id = NEW.job_application_id;

  IF officer_record.user_id IS NULL OR company_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.notification_workflows
  SET status = 'completed', completed_at = now(), next_send_at = NULL, updated_at = now()
  WHERE kind = 'application_reminder'
    AND recipient_user_id = officer_record.user_id
    AND status = 'active';

  notification_context := jsonb_build_object(
    'officer_name', coalesce(officer_record.full_name, 'Security professional'),
    'company_name', coalesce(company_record.company_name, 'the hiring company'),
    'company_location', coalesce(company_record.company_location, 'their local area'),
    'position', coalesce(NEW.position, 'Security Officer')
  );

  PERFORM public.enqueue_notification_workflow(
    'application_submitted_officer', officer_record.user_id, officer_record.email,
    'application-submitted-officer:' || NEW.id::text,
    company_record.id, NEW.officer_id, NEW.id, NULL, NULL, NULL,
    notification_context, now()
  );

  FOR recipient IN SELECT * FROM public.company_notification_recipients(company_record.id) LOOP
    PERFORM public.enqueue_notification_workflow(
      'application_submitted_company', recipient.user_id, recipient.email,
      'application-submitted-company:' || NEW.id::text,
      company_record.id, NEW.officer_id, NEW.id, NULL, NULL, NULL,
      notification_context, now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_job_application_not_selected(
  _job_application_id uuid,
  _reason text DEFAULT NULL
)
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
    RAISE EXCEPTION 'You are not authorized to close this application';
  END IF;

  IF result.status NOT IN ('interested', 'submitted', 'reviewed') THEN
    RAISE EXCEPTION 'Only an application awaiting interview scheduling can be closed';
  END IF;

  UPDATE public.job_applications
  SET status = 'not_selected',
      application_not_selected_at = now(),
      application_not_selected_by = auth.uid(),
      application_not_selected_reason = nullif(btrim(_reason), '')
  WHERE id = result.id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.close_job_application_not_selected(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_job_application_not_selected(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_application_decision_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  officer_record record;
  company_record record;
BEGIN
  IF NEW.status <> 'not_selected' OR OLD.status = 'not_selected' THEN
    RETURN NEW;
  END IF;

  SELECT officer.id, officer.user_id, profile.email, profile.full_name
  INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  SELECT company.id,
         company.company_name,
         nullif(concat_ws(', ', nullif(trim(company.company_city), ''), nullif(trim(company.company_state), '')), '') AS company_location,
         posting.title
  INTO company_record
  FROM public.job_postings posting
  JOIN public.company_profiles company ON company.id = posting.company_id
  WHERE posting.id = NEW.job_posting_id;

  IF officer_record.user_id IS NULL OR company_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_notification_workflow(
    'application_not_selected_officer',
    officer_record.user_id,
    officer_record.email,
    'application-not-selected:' || NEW.id::text,
    company_record.id,
    NEW.officer_id,
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'officer_name', coalesce(officer_record.full_name, 'Security professional'),
      'company_name', coalesce(company_record.company_name, 'the hiring company'),
      'company_location', coalesce(company_record.company_location, 'their local area'),
      'position', coalesce(company_record.title, 'Security Officer')
    ),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_application_decision_notifications_on_job_application ON public.job_applications;
CREATE TRIGGER queue_application_decision_notifications_on_job_application
AFTER UPDATE OF status ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.queue_application_decision_notifications();

COMMENT ON FUNCTION public.close_job_application_not_selected(uuid, text) IS
  'Closes a company-owned applicant record before interview scheduling and queues a courteous officer-facing status email.';
