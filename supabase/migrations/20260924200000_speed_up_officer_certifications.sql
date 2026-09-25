-- Certification screens always load records for one officer, newest first.
-- Without this index PostgreSQL scans the entire certification table before
-- applying RLS, which can exceed the mobile request statement timeout.
CREATE INDEX IF NOT EXISTS idx_certifications_officer_created_at
ON public.certifications (officer_id, created_at DESC);
