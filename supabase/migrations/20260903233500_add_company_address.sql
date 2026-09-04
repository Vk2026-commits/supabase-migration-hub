ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS company_address_unit text,
  ADD COLUMN IF NOT EXISTS company_city text,
  ADD COLUMN IF NOT EXISTS company_zip text;

COMMENT ON COLUMN public.company_profiles.company_address IS 'Primary company street address';
COMMENT ON COLUMN public.company_profiles.company_address_unit IS 'Suite or unit for the primary company address';
COMMENT ON COLUMN public.company_profiles.company_city IS 'City for the primary company address';
COMMENT ON COLUMN public.company_profiles.company_zip IS 'ZIP code for the primary company address';
