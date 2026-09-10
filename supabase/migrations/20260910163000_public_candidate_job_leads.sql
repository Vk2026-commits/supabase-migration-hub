-- Public job links capture a prospective officer before account creation. The
-- lead is privately claimed only when an authenticated user has the same email.
CREATE TABLE public.candidate_job_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id uuid NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  source text NOT NULL DEFAULT 'company_job_link',
  status text NOT NULL DEFAULT 'captured' CHECK (status IN ('captured', 'account_created', 'application_started', 'applied')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  account_created_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_posting_id, email)
);

ALTER TABLE public.candidate_job_leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX candidate_job_leads_company_captured_idx
ON public.candidate_job_leads (company_id, captured_at DESC);

CREATE POLICY "Company team views candidate leads"
ON public.candidate_job_leads FOR SELECT TO authenticated
USING (public.company_team_has_access(company_id));

CREATE OR REPLACE FUNCTION public.capture_candidate_job_lead(
  _job_id uuid, _full_name text, _email text, _phone text, _source text DEFAULT 'company_job_link'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  lead_id uuid;
  destination_company uuid;
BEGIN
  SELECT company_id INTO destination_company
  FROM public.job_postings
  WHERE id = _job_id AND status = 'active';
  IF destination_company IS NULL THEN RAISE EXCEPTION 'This job is no longer accepting applications'; END IF;
  IF length(trim(_full_name)) < 2 THEN RAISE EXCEPTION 'Enter your full name'; END IF;
  IF lower(trim(_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  IF length(regexp_replace(_phone, '[^0-9]', '', 'g')) < 10 THEN RAISE EXCEPTION 'Enter a valid phone number'; END IF;

  INSERT INTO public.candidate_job_leads (job_posting_id, company_id, full_name, email, phone, source)
  VALUES (_job_id, destination_company, trim(_full_name), lower(trim(_email)), trim(_phone), coalesce(nullif(trim(_source), ''), 'company_job_link'))
  ON CONFLICT (job_posting_id, email) DO UPDATE SET
    full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, source = EXCLUDED.source, updated_at = now()
  RETURNING id INTO lead_id;
  RETURN lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_candidate_job_lead(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_candidate_job_lead(uuid,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_candidate_job_lead_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE requested_lead uuid;
BEGIN
  BEGIN requested_lead := nullif(NEW.raw_user_meta_data->>'candidate_lead_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN requested_lead := NULL;
  END;
  IF requested_lead IS NOT NULL THEN
    UPDATE public.candidate_job_leads
    SET user_id = NEW.id, status = 'account_created', account_created_at = now(), updated_at = now()
    WHERE id = requested_lead AND lower(email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claim_candidate_job_lead_after_signup ON auth.users;
CREATE TRIGGER claim_candidate_job_lead_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.claim_candidate_job_lead_on_signup();
