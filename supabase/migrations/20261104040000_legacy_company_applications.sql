BEGIN;
CREATE TABLE public.company_legacy_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.company_profiles(id),
 source text NOT NULL,
 source_id text NOT NULL,
 source_submitted_at timestamptz NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 import_batch text NOT NULL,
 applicant_name text NOT NULL,
 email text NOT NULL,
 phone text,
 position text,
 application_data jsonb NOT NULL,
 UNIQUE(company_id,source,source_id)
);
ALTER TABLE public.company_legacy_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_company_read ON public.company_legacy_applications FOR SELECT TO authenticated USING(public.company_team_has_access(company_id));
REVOKE ALL ON public.company_legacy_applications FROM anon,authenticated;
GRANT SELECT ON public.company_legacy_applications TO authenticated;
CREATE INDEX ON public.company_legacy_applications(company_id,source_submitted_at);
COMMIT;
