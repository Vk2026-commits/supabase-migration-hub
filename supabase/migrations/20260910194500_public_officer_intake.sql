-- Allow We Find Guards to capture a prospective officer before the person
-- chooses a specific job or creates an account.
ALTER TABLE public.candidate_job_leads
  ALTER COLUMN job_posting_id DROP NOT NULL,
  ALTER COLUMN company_id DROP NOT NULL;

CREATE UNIQUE INDEX candidate_job_leads_general_email_idx
ON public.candidate_job_leads (email)
WHERE job_posting_id IS NULL;

CREATE OR REPLACE FUNCTION public.capture_officer_lead(
  _full_name text,
  _email text,
  _phone text,
  _source text DEFAULT 'homepage_officer_intake'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE lead_id uuid;
BEGIN
  IF length(trim(_full_name)) < 2 THEN RAISE EXCEPTION 'Enter your full name'; END IF;
  IF lower(trim(_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  IF length(regexp_replace(_phone, '[^0-9]', '', 'g')) < 10 THEN RAISE EXCEPTION 'Enter a valid phone number'; END IF;

  INSERT INTO public.candidate_job_leads (job_posting_id, company_id, full_name, email, phone, source)
  VALUES (NULL, NULL, trim(_full_name), lower(trim(_email)), trim(_phone), coalesce(nullif(trim(_source), ''), 'homepage_officer_intake'))
  ON CONFLICT (email) WHERE job_posting_id IS NULL DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    source = EXCLUDED.source,
    updated_at = now()
  RETURNING id INTO lead_id;
  RETURN lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_officer_lead(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_officer_lead(text,text,text,text) TO anon, authenticated;
