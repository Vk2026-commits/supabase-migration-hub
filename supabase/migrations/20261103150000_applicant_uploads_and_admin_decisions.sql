BEGIN;
-- Only the affected company’s owner and active administrators may decide.
CREATE OR REPLACE FUNCTION public.can_record_applicant_decision(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND (
   public.company_team_has_access(_company_id, ARRAY['owner','admin']::public.company_member_role[])
 );
$$;
REVOKE ALL ON FUNCTION public.can_record_applicant_decision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_record_applicant_decision(uuid) TO authenticated;

-- Avoid recursive officer-profile RLS when applicants save credentials.
ALTER POLICY "Officers can manage own certifications" ON public.certifications
 USING (public.is_officer_owner(auth.uid(), officer_id))
 WITH CHECK (public.is_officer_owner(auth.uid(), officer_id));

CREATE OR REPLACE FUNCTION public.decline_to_offer(_application_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE app public.job_applications; company uuid;
BEGIN
 SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
 SELECT company_id INTO company FROM public.job_postings WHERE id = app.job_posting_id;
 IF app.id IS NULL OR NOT public.can_record_applicant_decision(company) THEN
   RAISE EXCEPTION 'Only an authorized company owner or administrator can record this decision';
 END IF;
 IF app.no_offer_at IS NOT NULL THEN RETURN; END IF;
 IF app.status <> 'interview_completed' THEN RAISE EXCEPTION 'Complete the interview before recording an offer decision'; END IF;
 IF EXISTS (SELECT 1 FROM public.employment_offers WHERE job_application_id = app.id AND status IN ('sent','viewed','accepted','legacy_accepted')) THEN
   RAISE EXCEPTION 'An active offer already exists. Review it before recording a decision';
 END IF;
 UPDATE public.job_applications SET status = 'not_offered', no_offer_at = now() WHERE id = app.id;
 INSERT INTO public.messages(company_id, officer_id, job_application_id, sender_type, message)
 VALUES (company, app.officer_id, app.id, 'company', 'We’re unable to extend you an offer at this time, but we look forward to working with you in the future.');
END;
$$;
REVOKE ALL ON FUNCTION public.decline_to_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_to_offer(uuid) TO authenticated;

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

  -- Permit this audited workflow message from authorized hiring staff only.
  -- General conversation permissions remain governed by the existing policies.
  IF NOT actor_is_company AND NEW.sender_type = 'company'
     AND NEW.message = 'We’re unable to extend you an offer at this time, but we look forward to working with you in the future.'
     AND public.can_record_applicant_decision(NEW.company_id)
     AND EXISTS (SELECT 1 FROM public.job_applications a
       WHERE a.id = NEW.job_application_id AND a.officer_id = NEW.officer_id
         AND a.status = 'not_offered' AND a.no_offer_at IS NOT NULL) THEN
    actor_is_company := true;
  END IF;

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


COMMIT;
