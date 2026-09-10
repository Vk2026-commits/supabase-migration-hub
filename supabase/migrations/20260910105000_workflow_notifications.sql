-- Durable, recipient-specific email workflows for applications, offers, and employee onboarding.
-- The database queues each event. The notification Edge Function delivers branded email and
-- generates a fresh one-time action link for every delivery.

CREATE TABLE IF NOT EXISTS public.notification_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'application_reminder',
    'application_submitted_officer',
    'application_submitted_company',
    'offer_action',
    'onboarding_action',
    'onboarding_submitted_officer',
    'onboarding_submitted_company'
  )),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  target_key text NOT NULL,
  company_id uuid REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  officer_id uuid REFERENCES public.officer_profiles(id) ON DELETE CASCADE,
  hiring_application_id uuid REFERENCES public.guard_hiring_applications(id) ON DELETE CASCADE,
  employment_offer_id uuid REFERENCES public.employment_offers(id) ON DELETE CASCADE,
  hire_id uuid REFERENCES public.hires(id) ON DELETE CASCADE,
  onboarding_packet_id uuid REFERENCES public.officer_onboarding_packets(id) ON DELETE CASCADE,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'delivered', 'completed', 'cancelled')),
  last_sent_at timestamptz,
  next_send_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, recipient_user_id, target_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_workflows_due
  ON public.notification_workflows(next_send_at)
  WHERE status = 'active' AND next_send_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notification_action_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.notification_workflows(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(token_hash) = 64)
);

CREATE INDEX IF NOT EXISTS idx_notification_action_links_active
  ON public.notification_action_links(workflow_id, recipient_user_id, expires_at)
  WHERE used_at IS NULL AND superseded_at IS NULL;

ALTER TABLE public.notification_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_action_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_workflows FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_action_links FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_notification_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  project_url text;
  publishable_key text;
  scheduler_secret text;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'notification_project_url';
  SELECT decrypted_secret INTO publishable_key
  FROM vault.decrypted_secrets
  WHERE name = 'notification_publishable_key';
  SELECT decrypted_secret INTO scheduler_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notification_cron_secret';

  IF coalesce(project_url, '') = ''
     OR coalesce(publishable_key, '') = ''
     OR coalesce(scheduler_secret, '') = '' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-workflow-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', publishable_key,
      'x-notification-cron', scheduler_secret
    ),
    body := jsonb_build_object('action', 'dispatch')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification_workflow(
  _kind text,
  _recipient_user_id uuid,
  _recipient_email text,
  _target_key text,
  _company_id uuid DEFAULT NULL,
  _officer_id uuid DEFAULT NULL,
  _hiring_application_id uuid DEFAULT NULL,
  _employment_offer_id uuid DEFAULT NULL,
  _hire_id uuid DEFAULT NULL,
  _onboarding_packet_id uuid DEFAULT NULL,
  _context jsonb DEFAULT '{}'::jsonb,
  _next_send_at timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE workflow_id uuid;
BEGIN
  IF coalesce(trim(_recipient_email), '') = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notification_workflows (
    kind, recipient_user_id, recipient_email, target_key, company_id, officer_id,
    hiring_application_id, employment_offer_id, hire_id, onboarding_packet_id,
    context, next_send_at
  ) VALUES (
    _kind, _recipient_user_id, lower(trim(_recipient_email)), _target_key, _company_id,
    _officer_id, _hiring_application_id, _employment_offer_id, _hire_id,
    _onboarding_packet_id, coalesce(_context, '{}'::jsonb), _next_send_at
  )
  ON CONFLICT (kind, recipient_user_id, target_key) DO UPDATE
  SET recipient_email = EXCLUDED.recipient_email,
      context = public.notification_workflows.context || EXCLUDED.context,
      updated_at = now()
  RETURNING id INTO workflow_id;

  IF _next_send_at <= now() THEN
    PERFORM public.request_notification_dispatch();
  END IF;

  RETURN workflow_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_notification_recipients(_company_id uuid)
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recipients AS (
    SELECT company.user_id
    FROM public.company_profiles company
    WHERE company.id = _company_id
    UNION
    SELECT member.user_id
    FROM public.company_members member
    WHERE member.company_id = _company_id
      AND member.status = 'active'
  )
  SELECT profile.id, profile.email
  FROM recipients
  JOIN public.profiles profile ON profile.id = recipients.user_id
  WHERE coalesce(trim(profile.email), '') <> ''
$$;

CREATE OR REPLACE FUNCTION public.queue_officer_application_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'officer' AND coalesce(trim(NEW.email), '') <> '' THEN
    PERFORM public.enqueue_notification_workflow(
      'application_reminder',
      NEW.id,
      NEW.email,
      'officer-application:' || NEW.id::text,
      NULL, NULL, NULL, NULL, NULL, NULL,
      jsonb_build_object('officer_name', coalesce(NEW.full_name, 'there')),
      now() + interval '24 hours'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_officer_application_reminder_on_profile ON public.profiles;
CREATE TRIGGER queue_officer_application_reminder_on_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.queue_officer_application_reminder();

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
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'submitted' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT officer.id, officer.user_id, profile.email, profile.full_name
  INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  SELECT company.id, company.company_name
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

DROP TRIGGER IF EXISTS queue_application_submission_notifications_on_application ON public.guard_hiring_applications;
CREATE TRIGGER queue_application_submission_notifications_on_application
AFTER INSERT OR UPDATE OF status ON public.guard_hiring_applications
FOR EACH ROW EXECUTE FUNCTION public.queue_application_submission_notifications();

CREATE OR REPLACE FUNCTION public.queue_offer_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  officer_record record;
  company_record record;
  offer_context jsonb;
  deadline text;
BEGIN
  SELECT officer.id, officer.user_id, profile.email, profile.full_name
  INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  SELECT id, company_name INTO company_record
  FROM public.company_profiles
  WHERE id = NEW.company_id;

  IF officer_record.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IN ('accepted', 'declined', 'expired', 'withdrawn', 'revised') THEN
    UPDATE public.notification_workflows
    SET status = 'completed', completed_at = now(), next_send_at = NULL, updated_at = now()
    WHERE kind = 'offer_action'
      AND employment_offer_id = NEW.id
      AND status = 'active';
  END IF;

  IF NEW.status = 'sent' THEN
    IF TG_OP = 'INSERT' THEN
      deadline := NULLIF(NEW.terms->>'acceptanceDeadline', '');
      offer_context := jsonb_build_object(
        'officer_name', coalesce(officer_record.full_name, 'Security professional'),
        'company_name', coalesce(company_record.company_name, 'the hiring company'),
        'position', coalesce(NEW.terms->>'positionTitle', 'Security Officer'),
        'acceptance_deadline', deadline
      );
      PERFORM public.enqueue_notification_workflow(
        'offer_action', officer_record.user_id, officer_record.email,
        'offer:' || NEW.id::text,
        NEW.company_id, NEW.officer_id, NEW.hiring_application_id, NEW.id, NULL, NULL,
        offer_context, now()
      );
    ELSIF OLD.status IS DISTINCT FROM 'sent' THEN
      deadline := NULLIF(NEW.terms->>'acceptanceDeadline', '');
      offer_context := jsonb_build_object(
        'officer_name', coalesce(officer_record.full_name, 'Security professional'),
        'company_name', coalesce(company_record.company_name, 'the hiring company'),
        'position', coalesce(NEW.terms->>'positionTitle', 'Security Officer'),
        'acceptance_deadline', deadline
      );
      PERFORM public.enqueue_notification_workflow(
        'offer_action', officer_record.user_id, officer_record.email,
        'offer:' || NEW.id::text,
        NEW.company_id, NEW.officer_id, NEW.hiring_application_id, NEW.id, NULL, NULL,
        offer_context, now()
      );
    END IF;
  END IF;

  IF NEW.status = 'accepted' AND NEW.hire_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.enqueue_notification_workflow(
        'onboarding_action', officer_record.user_id, officer_record.email,
        'onboarding-hire:' || NEW.hire_id::text,
        NEW.company_id, NEW.officer_id, NEW.hiring_application_id, NEW.id, NEW.hire_id, NULL,
        jsonb_build_object(
          'officer_name', coalesce(officer_record.full_name, 'Security professional'),
          'company_name', coalesce(company_record.company_name, 'your hiring company'),
          'position', coalesce(NEW.terms->>'positionTitle', 'Security Officer')
        ),
        now()
      );
    ELSIF OLD.status IS DISTINCT FROM 'accepted' THEN
      PERFORM public.enqueue_notification_workflow(
        'onboarding_action', officer_record.user_id, officer_record.email,
        'onboarding-hire:' || NEW.hire_id::text,
        NEW.company_id, NEW.officer_id, NEW.hiring_application_id, NEW.id, NEW.hire_id, NULL,
        jsonb_build_object(
          'officer_name', coalesce(officer_record.full_name, 'Security professional'),
          'company_name', coalesce(company_record.company_name, 'your hiring company'),
          'position', coalesce(NEW.terms->>'positionTitle', 'Security Officer')
        ),
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_offer_notifications_on_offer ON public.employment_offers;
CREATE TRIGGER queue_offer_notifications_on_offer
AFTER INSERT OR UPDATE OF status ON public.employment_offers
FOR EACH ROW EXECUTE FUNCTION public.queue_offer_notifications();

CREATE OR REPLACE FUNCTION public.queue_onboarding_submission_notifications()
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
  IF NEW.status <> 'submitted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'submitted' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT officer.id, officer.user_id, profile.email, profile.full_name
  INTO officer_record
  FROM public.officer_profiles officer
  JOIN public.profiles profile ON profile.id = officer.user_id
  WHERE officer.id = NEW.officer_id;

  SELECT company.id, company.company_name
  INTO company_record
  FROM public.hires hire
  JOIN public.company_profiles company ON company.id = hire.company_id
  WHERE hire.id = NEW.hire_id;

  IF officer_record.user_id IS NULL OR company_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.notification_workflows
  SET status = 'completed', completed_at = now(), next_send_at = NULL, updated_at = now()
  WHERE kind = 'onboarding_action'
    AND hire_id = NEW.hire_id
    AND status = 'active';

  notification_context := jsonb_build_object(
    'officer_name', coalesce(officer_record.full_name, 'Security professional'),
    'company_name', coalesce(company_record.company_name, 'your hiring company')
  );

  PERFORM public.enqueue_notification_workflow(
    'onboarding_submitted_officer', officer_record.user_id, officer_record.email,
    'onboarding-submitted-officer:' || NEW.id::text,
    company_record.id, NEW.officer_id, NEW.hiring_application_id, NULL, NEW.hire_id, NEW.id,
    notification_context, now()
  );

  FOR recipient IN SELECT * FROM public.company_notification_recipients(company_record.id) LOOP
    PERFORM public.enqueue_notification_workflow(
      'onboarding_submitted_company', recipient.user_id, recipient.email,
      'onboarding-submitted-company:' || NEW.id::text,
      company_record.id, NEW.officer_id, NEW.hiring_application_id, NULL, NEW.hire_id, NEW.id,
      notification_context, now()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_onboarding_submission_notifications_on_packet ON public.officer_onboarding_packets;
CREATE TRIGGER queue_onboarding_submission_notifications_on_packet
AFTER INSERT OR UPDATE OF status ON public.officer_onboarding_packets
FOR EACH ROW EXECUTE FUNCTION public.queue_onboarding_submission_notifications();

-- Reminders begin with a newly created officer account. Existing incomplete
-- accounts are intentionally not bulk-enrolled, so enabling this feature does
-- not send unexpected retroactive email to historical users.

REVOKE ALL ON FUNCTION public.enqueue_notification_workflow(text, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_notification_recipients(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_notification_dispatch() FROM PUBLIC, anon, authenticated;
