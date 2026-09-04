CREATE TABLE IF NOT EXISTS public.guard_hiring_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  position text NOT NULL DEFAULT 'Security Officer',
  applicant_name text NOT NULL,
  applicant_email text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'reviewed', 'accepted', 'declined')),
  application_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_name text NOT NULL,
  signature_date date NOT NULL,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guard_hiring_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Officers manage their own hiring applications" ON public.guard_hiring_applications;
CREATE POLICY "Officers manage their own hiring applications"
ON public.guard_hiring_applications FOR ALL TO authenticated
USING (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = guard_hiring_applications.officer_id AND op.user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = guard_hiring_applications.officer_id AND op.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Companies view hiring applications for their jobs" ON public.guard_hiring_applications;
CREATE POLICY "Companies view hiring applications for their jobs"
ON public.guard_hiring_applications FOR SELECT TO authenticated
USING (
  job_application_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    JOIN public.company_profiles cp ON cp.id = jp.company_id
    WHERE ja.id = guard_hiring_applications.job_application_id
      AND cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Administrators view hiring applications" ON public.guard_hiring_applications;
CREATE POLICY "Administrators view hiring applications"
ON public.guard_hiring_applications FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'view_only'::app_role)
  OR has_role(auth.uid(), 'full_access'::app_role)
);

CREATE INDEX IF NOT EXISTS guard_hiring_applications_officer_idx ON public.guard_hiring_applications(officer_id);
CREATE INDEX IF NOT EXISTS guard_hiring_applications_job_idx ON public.guard_hiring_applications(job_application_id);

CREATE OR REPLACE FUNCTION public.set_guard_hiring_application_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_hiring_applications_updated_at ON public.guard_hiring_applications;
CREATE TRIGGER guard_hiring_applications_updated_at
BEFORE UPDATE ON public.guard_hiring_applications
FOR EACH ROW EXECUTE FUNCTION public.set_guard_hiring_application_updated_at();
