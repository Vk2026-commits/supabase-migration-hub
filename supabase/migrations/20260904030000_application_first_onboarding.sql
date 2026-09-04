-- Application-first officer onboarding: one editable master plus immutable job copies.
ALTER TABLE public.guard_hiring_applications
  ADD COLUMN IF NOT EXISTS application_type text NOT NULL DEFAULT 'master',
  ADD COLUMN IF NOT EXISTS source_application_id uuid REFERENCES public.guard_hiring_applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_step integer NOT NULL DEFAULT 0;

ALTER TABLE public.guard_hiring_applications
  DROP CONSTRAINT IF EXISTS guard_hiring_applications_application_type_check;
ALTER TABLE public.guard_hiring_applications
  ADD CONSTRAINT guard_hiring_applications_application_type_check
  CHECK (application_type IN ('master', 'employer_copy'));

ALTER TABLE public.guard_hiring_applications
  DROP CONSTRAINT IF EXISTS guard_hiring_applications_current_step_check;
ALTER TABLE public.guard_hiring_applications
  ADD CONSTRAINT guard_hiring_applications_current_step_check
  CHECK (current_step BETWEEN 0 AND 9);

-- Drafts do not have a signature until the final step.
ALTER TABLE public.guard_hiring_applications ALTER COLUMN signature_name DROP NOT NULL;
ALTER TABLE public.guard_hiring_applications ALTER COLUMN signature_date DROP NOT NULL;

-- Existing rows were submitted applications; keep them as employer copies when linked to a job.
UPDATE public.guard_hiring_applications
SET application_type = CASE WHEN job_application_id IS NULL THEN 'master' ELSE 'employer_copy' END
WHERE application_type = 'master';

-- Preserve legacy rows without deleting them while selecting a single newest master/copy.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY officer_id ORDER BY updated_at DESC, created_at DESC) AS position
  FROM public.guard_hiring_applications
  WHERE application_type = 'master'
)
UPDATE public.guard_hiring_applications application
SET application_type = 'employer_copy'
FROM ranked
WHERE application.id = ranked.id AND ranked.position > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY job_application_id ORDER BY updated_at DESC, created_at DESC) AS position
  FROM public.guard_hiring_applications
  WHERE application_type = 'employer_copy' AND job_application_id IS NOT NULL
)
UPDATE public.guard_hiring_applications application
SET job_application_id = NULL
FROM ranked
WHERE application.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS guard_hiring_applications_one_master_per_officer
  ON public.guard_hiring_applications(officer_id)
  WHERE application_type = 'master';

CREATE UNIQUE INDEX IF NOT EXISTS guard_hiring_applications_one_copy_per_job
  ON public.guard_hiring_applications(job_application_id)
  WHERE application_type = 'employer_copy' AND job_application_id IS NOT NULL;

-- Replace the original broad ALL policy so submitted employer snapshots cannot be edited.
DROP POLICY IF EXISTS "Officers manage their own hiring applications" ON public.guard_hiring_applications;
DROP POLICY IF EXISTS "Officers view their own hiring applications" ON public.guard_hiring_applications;
DROP POLICY IF EXISTS "Officers create their own hiring applications" ON public.guard_hiring_applications;
DROP POLICY IF EXISTS "Officers update their master hiring application" ON public.guard_hiring_applications;
DROP POLICY IF EXISTS "Officers delete their master hiring application" ON public.guard_hiring_applications;

CREATE POLICY "Officers view their own hiring applications"
ON public.guard_hiring_applications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Officers create their own hiring applications"
ON public.guard_hiring_applications FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.id = guard_hiring_applications.officer_id AND op.user_id = auth.uid()
  )
);

CREATE POLICY "Officers update their master hiring application"
ON public.guard_hiring_applications FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND application_type = 'master')
WITH CHECK (user_id = auth.uid() AND application_type = 'master');

CREATE POLICY "Officers delete their master hiring application"
ON public.guard_hiring_applications FOR DELETE TO authenticated
USING (user_id = auth.uid() AND application_type = 'master');
