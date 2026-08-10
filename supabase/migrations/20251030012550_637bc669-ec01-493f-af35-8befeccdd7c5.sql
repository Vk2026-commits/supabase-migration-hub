-- Add date_of_birth to officer_profiles for age tracking
ALTER TABLE public.officer_profiles 
ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Add state field to company_profiles for location tracking
ALTER TABLE public.company_profiles 
ADD COLUMN IF NOT EXISTS company_state text;

-- Add comment for clarity
COMMENT ON COLUMN public.officer_profiles.date_of_birth IS 'Date of birth for age demographic analysis';
COMMENT ON COLUMN public.company_profiles.company_state IS 'State where company is located for geographic analysis';