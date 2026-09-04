ALTER TABLE public.officer_onboarding_packets
  ADD COLUMN IF NOT EXISTS i9_document_path text,
  ADD COLUMN IF NOT EXISTS w4_document_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('onboarding-documents', 'onboarding-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Officers manage their onboarding documents"
ON storage.objects FOR ALL
USING (bucket_id = 'onboarding-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'onboarding-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Companies view submitted onboarding documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-documents' AND EXISTS (
    SELECT 1 FROM public.officer_onboarding_packets packet
    JOIN public.guard_hiring_applications gha ON gha.id = packet.hiring_application_id
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    JOIN public.company_profiles cp ON cp.id = jp.company_id
    WHERE packet.status = 'submitted'
      AND cp.user_id = auth.uid()
      AND (packet.i9_document_path = name OR packet.w4_document_path = name)
  )
);
