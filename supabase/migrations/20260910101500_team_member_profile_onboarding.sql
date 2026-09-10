-- Collect a minimal, private staff profile before an invited team member gains access.
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS password_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

COMMENT ON COLUMN public.company_members.phone IS
  'Private mobile number collected from an invited company team member during account setup.';
COMMENT ON COLUMN public.company_members.job_title IS
  'Company team member job title collected during account setup.';
COMMENT ON COLUMN public.company_members.password_created_at IS
  'Timestamp recorded after an invited member successfully creates a password.';
COMMENT ON COLUMN public.company_members.profile_completed_at IS
  'Timestamp recorded after an invited member provides the required staff profile details and gains access.';
