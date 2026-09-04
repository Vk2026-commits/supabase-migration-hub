-- Offer terms are prepared and approved by the hiring company before the
-- employee receives the onboarding packet. Officers can read, but cannot
-- change, these terms through the existing hires RLS policies.
ALTER TABLE public.hires
  ADD COLUMN IF NOT EXISTS offer_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS offer_prepared_at timestamptz;

