-- Let every authorized company team member retrieve the submitted onboarding
-- packet and its immutable document files. Drafts remain officer-only.
DROP POLICY IF EXISTS "Companies view submitted onboarding for their applicants"
  ON public.officer_onboarding_packets;
CREATE POLICY "Company team views submitted onboarding packets"
ON public.officer_onboarding_packets FOR SELECT TO authenticated
USING (
  (status = 'submitted' OR i9_submitted_at IS NOT NULL OR w4_submitted_at IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM public.hires hire
    WHERE hire.id = officer_onboarding_packets.hire_id
      AND public.company_team_has_access(hire.company_id)
  )
);

DROP POLICY IF EXISTS "Companies view their employee compliance documents"
  ON public.officer_compliance_documents;
CREATE POLICY "Company team views employee compliance documents"
ON public.officer_compliance_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.officer_onboarding_packets packet
    JOIN public.hires hire ON hire.id = packet.hire_id
    WHERE packet.id = officer_compliance_documents.packet_id
      AND (packet.status = 'submitted' OR packet.i9_submitted_at IS NOT NULL OR packet.w4_submitted_at IS NOT NULL)
      AND public.company_team_has_access(hire.company_id)
  )
);

DROP POLICY IF EXISTS "Companies view submitted onboarding documents" ON storage.objects;
CREATE POLICY "Company team views submitted onboarding documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'onboarding-documents'
  AND EXISTS (
    SELECT 1
    FROM public.officer_onboarding_packets packet
    JOIN public.hires hire ON hire.id = packet.hire_id
    LEFT JOIN public.officer_compliance_documents compliance ON compliance.packet_id = packet.id
    WHERE public.company_team_has_access(hire.company_id)
      AND (packet.status = 'submitted' OR packet.i9_submitted_at IS NOT NULL OR packet.w4_submitted_at IS NOT NULL)
      AND (
        compliance.storage_path = storage.objects.name
        OR packet.i9_document_path = storage.objects.name
        OR packet.w4_document_path = storage.objects.name
      )
  )
);
