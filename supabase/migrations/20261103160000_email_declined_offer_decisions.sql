-- Queue the existing courteous application-decision email for post-interview declines too.
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
  IF NEW.status NOT IN ('not_selected', 'not_offered') OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
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

