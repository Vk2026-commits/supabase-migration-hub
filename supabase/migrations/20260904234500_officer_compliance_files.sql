-- Immutable index of every signed/submitted onboarding document. The object
-- itself uses a unique storage path; this row supplies the officer, employer,
-- version, signer time, and integrity hash needed to retrieve an audit file.
CREATE TABLE IF NOT EXISTS public.officer_compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.officer_onboarding_packets(id) ON DELETE RESTRICT,
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE RESTRICT,
  hiring_application_id uuid REFERENCES public.guard_hiring_applications(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  document_label text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  storage_path text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  signed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  UNIQUE (packet_id, document_type, version)
);

ALTER TABLE public.officer_compliance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers insert their own compliance documents"
ON public.officer_compliance_documents FOR INSERT
WITH CHECK (
  created_by = auth.uid() AND officer_id IN (
    SELECT id FROM public.officer_profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Officers view their own compliance documents"
ON public.officer_compliance_documents FOR SELECT
USING (officer_id IN (SELECT id FROM public.officer_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Companies view their employee compliance documents"
ON public.officer_compliance_documents FOR SELECT
USING (
  hiring_application_id IN (
    SELECT gha.id
    FROM public.guard_hiring_applications gha
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    JOIN public.company_profiles cp ON cp.id = jp.company_id
    WHERE cp.user_id = auth.uid()
  )
);

CREATE POLICY "Admins view all compliance documents"
ON public.officer_compliance_documents FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.prevent_compliance_document_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Compliance document records are immutable; create a new version instead';
END;
$$;

DROP TRIGGER IF EXISTS compliance_documents_are_immutable ON public.officer_compliance_documents;
CREATE TRIGGER compliance_documents_are_immutable
BEFORE UPDATE OR DELETE ON public.officer_compliance_documents
FOR EACH ROW EXECUTE FUNCTION public.prevent_compliance_document_changes();

CREATE INDEX IF NOT EXISTS idx_compliance_documents_officer
ON public.officer_compliance_documents(officer_id, submitted_at DESC);

-- Submitted files are append-only as well. A correction is a new version,
-- never an overwrite or deletion of the prior signed document.
DROP POLICY IF EXISTS "Officers manage their onboarding documents" ON storage.objects;
CREATE POLICY "Officers upload their onboarding documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'onboarding-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Officers view their onboarding documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'onboarding-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Companies view submitted onboarding documents" ON storage.objects;
CREATE POLICY "Companies view submitted onboarding documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-documents' AND (
    EXISTS (
      SELECT 1 FROM public.officer_compliance_documents document
      JOIN public.guard_hiring_applications gha ON gha.id = document.hiring_application_id
      JOIN public.job_applications ja ON ja.id = gha.job_application_id
      JOIN public.job_postings jp ON jp.id = ja.job_posting_id
      JOIN public.company_profiles cp ON cp.id = jp.company_id
      WHERE cp.user_id = auth.uid() AND document.storage_path = name
    )
    OR EXISTS (
      SELECT 1 FROM public.officer_onboarding_packets packet
      JOIN public.guard_hiring_applications gha ON gha.id = packet.hiring_application_id
      JOIN public.job_applications ja ON ja.id = gha.job_application_id
      JOIN public.job_postings jp ON jp.id = ja.job_posting_id
      JOIN public.company_profiles cp ON cp.id = jp.company_id
      WHERE cp.user_id = auth.uid() AND (
        (packet.i9_submitted_at IS NOT NULL AND packet.i9_document_path = name)
        OR (packet.w4_submitted_at IS NOT NULL AND packet.w4_document_path = name)
      )
    )
  )
);
