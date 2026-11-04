BEGIN;
-- Explicitly reviewed duplicate groups; original submissions remain immutable.
ALTER TABLE public.company_legacy_applications
 ADD COLUMN duplicate_group_id uuid,
 ADD COLUMN matched_officer_id uuid REFERENCES public.officer_profiles(id) ON DELETE SET NULL;
COMMIT;
