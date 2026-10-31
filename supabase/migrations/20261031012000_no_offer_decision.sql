ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS no_offer_at timestamptz;
CREATE OR REPLACE FUNCTION public.decline_to_offer(_application_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE app public.job_applications; company uuid;
BEGIN
 SELECT * INTO app FROM public.job_applications WHERE id = _application_id FOR UPDATE;
 SELECT company_id INTO company FROM public.job_postings WHERE id = app.job_posting_id;
 IF app.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.company_profiles WHERE id = company AND user_id = auth.uid()) THEN
   RAISE EXCEPTION 'Only the company account owner can send this applicant decision with the current messaging permissions';
 END IF;
 IF app.no_offer_at IS NOT NULL THEN RETURN; END IF;
 IF app.status <> 'interview_completed' THEN RAISE EXCEPTION 'Complete the interview before recording an offer decision'; END IF;
 IF EXISTS (SELECT 1 FROM public.employment_offers WHERE job_application_id = app.id AND status IN ('sent','viewed','accepted','legacy_accepted')) THEN
   RAISE EXCEPTION 'An active offer already exists. Review it before recording a decision';
 END IF;
 UPDATE public.job_applications SET status = 'not_offered', no_offer_at = now(), updated_at = now() WHERE id = app.id;
 INSERT INTO public.messages(company_id, officer_id, job_application_id, sender_type, message)
 VALUES (company, app.officer_id, app.id, 'company', 'We’re unable to extend you an offer at this time, but we look forward to working with you in the future.');
END;
$$;
REVOKE ALL ON FUNCTION public.decline_to_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_to_offer(uuid) TO authenticated;
