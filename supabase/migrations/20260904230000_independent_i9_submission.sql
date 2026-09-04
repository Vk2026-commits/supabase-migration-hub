ALTER TABLE public.officer_onboarding_packets
  ADD COLUMN IF NOT EXISTS i9_submitted_at timestamptz;

DROP POLICY IF EXISTS "Companies view submitted onboarding for their applicants"
ON public.officer_onboarding_packets;

CREATE POLICY "Companies view submitted onboarding for their applicants"
ON public.officer_onboarding_packets FOR SELECT
USING (
  (status = 'submitted' OR i9_submitted_at IS NOT NULL)
  AND hiring_application_id IN (
    SELECT gha.id
    FROM public.guard_hiring_applications gha
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    JOIN public.company_profiles cp ON cp.id = jp.company_id
    WHERE cp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Companies view submitted onboarding documents"
ON storage.objects;

CREATE POLICY "Companies view submitted onboarding documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-documents' AND EXISTS (
    SELECT 1
    FROM public.officer_onboarding_packets packet
    JOIN public.guard_hiring_applications gha ON gha.id = packet.hiring_application_id
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    JOIN public.company_profiles cp ON cp.id = jp.company_id
    WHERE cp.user_id = auth.uid()
      AND (
        (packet.i9_submitted_at IS NOT NULL AND packet.i9_document_path = name)
        OR (packet.status = 'submitted' AND packet.w4_document_path = name)
      )
  )
);
