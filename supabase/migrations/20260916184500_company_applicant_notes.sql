CREATE TABLE IF NOT EXISTS public.company_applicant_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  job_application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_application_id),
  CHECK (char_length(note) <= 10000)
);

ALTER TABLE public.company_applicant_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS company_applicant_notes_company_idx
  ON public.company_applicant_notes(company_id, updated_at DESC);

DROP POLICY IF EXISTS "Company teams manage private applicant notes" ON public.company_applicant_notes;
CREATE POLICY "Company teams manage private applicant notes"
ON public.company_applicant_notes FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_profiles company
    WHERE company.id = company_applicant_notes.company_id
      AND company.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members member
    WHERE member.company_id = company_applicant_notes.company_id
      AND member.user_id = auth.uid()
      AND member.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.job_applications application
    JOIN public.job_postings posting ON posting.id = application.job_posting_id
    WHERE application.id = company_applicant_notes.job_application_id
      AND posting.company_id = company_applicant_notes.company_id
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.company_profiles company
      WHERE company.id = company_applicant_notes.company_id
        AND company.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members member
      WHERE member.company_id = company_applicant_notes.company_id
        AND member.user_id = auth.uid()
        AND member.status = 'active'
    )
  )
);

DROP TRIGGER IF EXISTS company_applicant_notes_updated_at ON public.company_applicant_notes;
CREATE TRIGGER company_applicant_notes_updated_at
BEFORE UPDATE ON public.company_applicant_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.company_applicant_notes IS
  'Private internal company notes about an applicant; never exposed to the officer.';
