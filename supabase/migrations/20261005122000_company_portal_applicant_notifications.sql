-- Durable, recipient-specific portal notifications for company applicant review.
-- Email notifications remain in notification_workflows; this queue is the in-product
-- task list that company owners and active team members can mark complete.

CREATE TABLE IF NOT EXISTS public.company_portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new_applicant')),
  job_application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  hiring_application_id uuid NOT NULL REFERENCES public.guard_hiring_applications(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, recipient_user_id, kind, job_application_id)
);

CREATE INDEX IF NOT EXISTS company_portal_notifications_unread_idx
  ON public.company_portal_notifications (company_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.company_portal_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.company_portal_notifications FROM anon, authenticated;
GRANT SELECT ON TABLE public.company_portal_notifications TO authenticated;

DROP POLICY IF EXISTS "Company notification recipients can read their notifications" ON public.company_portal_notifications;
CREATE POLICY "Company notification recipients can read their notifications"
  ON public.company_portal_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_company_portal_notification_read(_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.company_portal_notifications
  SET read_at = coalesce(read_at, now())
  WHERE id = _notification_id
    AND recipient_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_company_portal_new_applicant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_record record;
  officer_record record;
  recipient record;
  notification_title text;
  notification_body text;
BEGIN
  IF NEW.application_type <> 'employer_copy' OR NEW.status <> 'submitted' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT posting.company_id, company.company_name, posting.title AS position
  INTO company_record
  FROM public.job_applications application
  JOIN public.job_postings posting ON posting.id = application.job_posting_id
  JOIN public.company_profiles company ON company.id = posting.company_id
  WHERE application.id = NEW.job_application_id;

  IF company_record.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(NULLIF(trim(NEW.applicant_name), ''), profile.full_name, 'A security professional') AS full_name
  INTO officer_record
  FROM public.officer_profiles officer
  LEFT JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  notification_title := coalesce(officer_record.full_name, 'A security professional') || ' submitted an application';
  notification_body := 'New applicant for ' || coalesce(company_record.position, NEW.position, 'a security position') || '. Review the submitted application and supporting documents.';

  FOR recipient IN SELECT * FROM public.company_notification_recipients(company_record.company_id) LOOP
    INSERT INTO public.company_portal_notifications (
      company_id,
      recipient_user_id,
      kind,
      job_application_id,
      hiring_application_id,
      title,
      body
    ) VALUES (
      company_record.company_id,
      recipient.user_id,
      'new_applicant',
      NEW.job_application_id,
      NEW.id,
      notification_title,
      notification_body
    ) ON CONFLICT (company_id, recipient_user_id, kind, job_application_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_company_portal_new_applicant_on_submission ON public.guard_hiring_applications;
CREATE TRIGGER queue_company_portal_new_applicant_on_submission
AFTER INSERT OR UPDATE OF status ON public.guard_hiring_applications
FOR EACH ROW EXECUTE FUNCTION public.queue_company_portal_new_applicant();

REVOKE ALL ON FUNCTION public.queue_company_portal_new_applicant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_company_portal_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_company_portal_notification_read(uuid) TO authenticated;
