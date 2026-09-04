-- We Find Guards employee onboarding packets.
-- Ordinary answers are kept here. SSN and bank data remain in the separately
-- encrypted officer_sensitive_data record and are never written to JSONB.
CREATE TABLE IF NOT EXISTS public.officer_onboarding_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE CASCADE,
  hiring_application_id uuid REFERENCES public.guard_hiring_applications(id) ON DELETE SET NULL,
  company_name text NOT NULL DEFAULT 'Hiring company',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 7),
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_name text,
  signature_date date,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (officer_id, hiring_application_id)
);

ALTER TABLE public.officer_onboarding_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers manage their own onboarding packet"
ON public.officer_onboarding_packets FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND officer_id IN (
  SELECT id FROM public.officer_profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Companies view submitted onboarding for their applicants"
ON public.officer_onboarding_packets FOR SELECT
USING (
  status = 'submitted' AND hiring_application_id IN (
    SELECT gha.id
    FROM public.guard_hiring_applications gha
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    JOIN public.company_profiles cp ON cp.id = jp.company_id
    WHERE cp.user_id = auth.uid()
  )
);

CREATE POLICY "Admins view onboarding packets"
ON public.officer_onboarding_packets FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_officer_onboarding_packets_officer
ON public.officer_onboarding_packets(officer_id, updated_at DESC);

ALTER TABLE public.officer_sensitive_data
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_routing_encrypted bytea,
  ADD COLUMN IF NOT EXISTS bank_routing_last_four text,
  ADD COLUMN IF NOT EXISTS bank_account_encrypted bytea,
  ADD COLUMN IF NOT EXISTS bank_account_last_four text,
  ADD COLUMN IF NOT EXISTS bank_account_type text;

