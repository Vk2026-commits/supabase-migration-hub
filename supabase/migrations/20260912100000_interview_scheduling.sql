CREATE TABLE IF NOT EXISTS public.interview_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE RESTRICT,
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE RESTRICT,
  job_application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE RESTRICT,
  interview_type text NOT NULL CHECK (interview_type IN ('video', 'in_person')),
  scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL,
  location text,
  meeting_url text,
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (interview_type <> 'video' OR nullif(btrim(meeting_url), '') IS NOT NULL),
  CHECK (interview_type <> 'in_person' OR nullif(btrim(location), '') IS NOT NULL)
);

ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS interview_schedules_application_idx ON public.interview_schedules(job_application_id, scheduled_at DESC);

CREATE POLICY "Company teams manage interviews"
ON public.interview_schedules FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = interview_schedules.company_id AND company.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = interview_schedules.company_id AND member.user_id = auth.uid() AND member.status = 'active')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_applications application
    JOIN public.job_postings posting ON posting.id = application.job_posting_id
    WHERE application.id = interview_schedules.job_application_id
      AND application.officer_id = interview_schedules.officer_id
      AND posting.company_id = interview_schedules.company_id
  )
  AND (
    EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = interview_schedules.company_id AND company.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = interview_schedules.company_id AND member.user_id = auth.uid() AND member.status = 'active')
  )
);

CREATE POLICY "Officers view their interviews"
ON public.interview_schedules FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.officer_profiles officer WHERE officer.id = interview_schedules.officer_id AND officer.user_id = auth.uid()));

DROP TRIGGER IF EXISTS interview_schedules_updated_at ON public.interview_schedules;
CREATE TRIGGER interview_schedules_updated_at BEFORE UPDATE ON public.interview_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY "Company teams advance their applications"
ON public.job_applications FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_postings posting
    WHERE posting.id = job_applications.job_posting_id
      AND (
        EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = posting.company_id AND company.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = posting.company_id AND member.user_id = auth.uid() AND member.status = 'active')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_postings posting
    WHERE posting.id = job_applications.job_posting_id
      AND (
        EXISTS (SELECT 1 FROM public.company_profiles company WHERE company.id = posting.company_id AND company.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members member WHERE member.company_id = posting.company_id AND member.user_id = auth.uid() AND member.status = 'active')
      )
  )
);

-- A resubmission is a new immutable employer copy. The prior submitted copy is
-- retained for audit history instead of being overwritten.
DROP INDEX IF EXISTS public.guard_hiring_applications_one_copy_per_job;
CREATE INDEX IF NOT EXISTS guard_hiring_applications_job_revision_idx
  ON public.guard_hiring_applications(job_application_id, submitted_at DESC, created_at DESC)
  WHERE application_type = 'employer_copy';

-- Limit resume access to paid employers who actually received an application
-- from the officer, including active members of that employer's team.
DROP POLICY IF EXISTS "Premium companies can view resumes" ON storage.objects;
CREATE POLICY "Applicant companies can view submitted resumes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'resumes'
  AND EXISTS (
    SELECT 1
    FROM public.officer_profiles officer
    JOIN public.job_applications application ON application.officer_id = officer.id
    JOIN public.job_postings posting ON posting.id = application.job_posting_id
    JOIN public.company_profiles company ON company.id = posting.company_id
    WHERE officer.user_id::text = (storage.foldername(name))[1]
      AND company.subscription_tier IN ('professional', 'premium')
      AND (
        company.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members member
          WHERE member.company_id = company.id AND member.user_id = auth.uid() AND member.status = 'active'
        )
      )
  )
);
