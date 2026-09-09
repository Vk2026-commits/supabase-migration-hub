-- Make employer/officer chat suitable for hiring records. Existing rows remain
-- readable as legacy messages, while every new row has a server-verified sender.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS job_application_id uuid REFERENCES public.job_applications(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_until timestamptz,
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false;

UPDATE public.messages
SET retention_until = created_at + interval '7 years'
WHERE retention_until IS NULL;

ALTER TABLE public.messages
  ALTER COLUMN retention_until SET DEFAULT (now() + interval '7 years'),
  ALTER COLUMN retention_until SET NOT NULL;

-- A deleted profile must not silently erase hiring communications.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_company_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.company_profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_officer_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_officer_id_fkey
  FOREIGN KEY (officer_id) REFERENCES public.officer_profiles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_messages_job_application
  ON public.messages(job_application_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages(company_id, officer_id, is_read)
  WHERE is_read = false;

CREATE TABLE IF NOT EXISTS public.message_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE RESTRICT,
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('sent', 'read')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.message_audit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_message_audit_message
  ON public.message_audit_events(message_id, occurred_at);

CREATE OR REPLACE FUNCTION public.validate_message_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_is_company boolean;
  actor_is_officer boolean;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to send a message';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_profiles cp
    WHERE cp.id = NEW.company_id AND cp.user_id = actor
  ) INTO actor_is_company;

  SELECT EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = NEW.officer_id AND op.user_id = actor
  ) INTO actor_is_officer;

  IF NOT actor_is_company AND NOT actor_is_officer THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  NEW.message := btrim(NEW.message);
  IF NEW.message = '' THEN
    RAISE EXCEPTION 'A message cannot be empty';
  END IF;

  IF NEW.job_application_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    WHERE ja.id = NEW.job_application_id
      AND ja.officer_id = NEW.officer_id
      AND jp.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'The selected application does not belong to this employer and officer';
  END IF;

  NEW.sender_user_id := actor;
  NEW.sender_type := CASE WHEN actor_is_company THEN 'company' ELSE 'officer' END;
  NEW.is_read := false;
  NEW.read_at := NULL;
  NEW.retention_until := now() + interval '7 years';
  NEW.legal_hold := false;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_message_read_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  recipient_is_company boolean;
  recipient_is_officer boolean;
BEGIN
  IF OLD.is_read THEN
    RAISE EXCEPTION 'This message has already been marked as read';
  END IF;

  recipient_is_company := OLD.sender_type = 'officer' AND EXISTS (
    SELECT 1 FROM public.company_profiles cp
    WHERE cp.id = OLD.company_id AND cp.user_id = actor
  );
  recipient_is_officer := OLD.sender_type = 'company' AND EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = OLD.officer_id AND op.user_id = actor
  );

  IF NOT recipient_is_company AND NOT recipient_is_officer THEN
    RAISE EXCEPTION 'Only the recipient can mark a message as read';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.officer_id IS DISTINCT FROM OLD.officer_id
    OR NEW.sender_type IS DISTINCT FROM OLD.sender_type
    OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
    OR NEW.job_application_id IS DISTINCT FROM OLD.job_application_id
    OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.retention_until IS DISTINCT FROM OLD.retention_until
    OR NEW.legal_hold IS DISTINCT FROM OLD.legal_hold
    OR NEW.is_read IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Messages are immutable; only unread messages may be marked as read';
  END IF;

  NEW.read_at := COALESCE(OLD.read_at, now());
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_message_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.message_audit_events
      (message_id, company_id, officer_id, actor_user_id, action, metadata)
    VALUES
      (NEW.id, NEW.company_id, NEW.officer_id, auth.uid(), 'sent',
       jsonb_build_object('job_application_id', NEW.job_application_id));
  ELSIF OLD.is_read = false AND NEW.is_read = true THEN
    INSERT INTO public.message_audit_events
      (message_id, company_id, officer_id, actor_user_id, action)
    VALUES
      (NEW.id, NEW.company_id, NEW.officer_id, auth.uid(), 'read');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_message_insert ON public.messages;
CREATE TRIGGER validate_message_insert
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.validate_message_write();

DROP TRIGGER IF EXISTS validate_message_update ON public.messages;
CREATE TRIGGER validate_message_update
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.validate_message_read_update();

DROP TRIGGER IF EXISTS audit_message_changes ON public.messages;
CREATE TRIGGER audit_message_changes
AFTER INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.audit_message_event();

DROP POLICY IF EXISTS "Companies can manage their messages" ON public.messages;
DROP POLICY IF EXISTS "Officers can manage their messages" ON public.messages;

CREATE POLICY "Participants view their messages"
ON public.messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_profiles cp
    WHERE cp.id = messages.company_id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = messages.officer_id AND op.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'view_only'::public.app_role)
  OR public.has_role(auth.uid(), 'full_access'::public.app_role)
);

CREATE POLICY "Participants send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_profiles cp
    WHERE cp.id = messages.company_id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = messages.officer_id AND op.user_id = auth.uid()
  )
);

CREATE POLICY "Recipients mark messages read"
ON public.messages FOR UPDATE TO authenticated
USING (
  (sender_type = 'officer' AND EXISTS (
    SELECT 1 FROM public.company_profiles cp
    WHERE cp.id = messages.company_id AND cp.user_id = auth.uid()
  ))
  OR (sender_type = 'company' AND EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = messages.officer_id AND op.user_id = auth.uid()
  ))
)
WITH CHECK (is_read = true);

-- No DELETE policy is intentional: chat records are retained for audit.
CREATE POLICY "Participants view message audit events"
ON public.message_audit_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_profiles cp
    WHERE cp.id = message_audit_events.company_id AND cp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = message_audit_events.officer_id AND op.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'view_only'::public.app_role)
  OR public.has_role(auth.uid(), 'full_access'::public.app_role)
);

COMMENT ON COLUMN public.messages.sender_user_id IS
  'Authenticated sender identity assigned by a database trigger; NULL identifies a legacy message.';
COMMENT ON COLUMN public.messages.job_application_id IS
  'Optional hiring context. When present it is verified against the company and officer.';
COMMENT ON COLUMN public.messages.retention_until IS
  'Minimum retention date for the hiring communication record.';
