-- Deploy the multi-company workspace client before transferring ownership.
-- Preserve owner lookups without restricting one user to one company.
BEGIN;
ALTER TABLE public.company_profiles DROP CONSTRAINT IF EXISTS company_profiles_user_id_key;
CREATE INDEX IF NOT EXISTS company_profiles_owner_lookup_idx ON public.company_profiles(user_id);
COMMIT;
