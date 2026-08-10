-- Add license fields to company_profiles
ALTER TABLE public.company_profiles 
ADD COLUMN IF NOT EXISTS license_number TEXT,
ADD COLUMN IF NOT EXISTS license_types TEXT[];

-- Add employment and availability fields to officer_profiles
ALTER TABLE public.officer_profiles 
ADD COLUMN IF NOT EXISTS employment_type TEXT[], -- Can select multiple: full-time, part-time, contract, etc.
ADD COLUMN IF NOT EXISTS availability_schedule JSONB; -- Store day/time availability as JSON

COMMENT ON COLUMN company_profiles.license_types IS 'Texas security license types: Class A (Private Investigation), Class B (Security Contractor with subcategories), Class C (Both)';
COMMENT ON COLUMN officer_profiles.availability_schedule IS 'Weekly availability schedule with days and time ranges';