-- Paid companies may review the canonical records and secured uploads of officers
-- who applied to one of their jobs. Access remains scoped to that relationship.
CREATE OR REPLACE FUNCTION public.company_has_applicant_relationship(
  _company_user_id uuid,
  _officer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_applications ja
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    JOIN public.company_profiles cp ON cp.id = jp.company_id
    WHERE cp.user_id = _company_user_id
      AND ja.officer_id = _officer_id
  ) OR public.company_hired_officer(_company_user_id, _officer_id)
    OR public.company_interested_in_officer(_company_user_id, _officer_id);
$$;

REVOKE ALL ON FUNCTION public.company_has_applicant_relationship(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_has_applicant_relationship(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Companies review applicant certifications" ON public.certifications;
CREATE POLICY "Companies review applicant certifications"
ON public.certifications FOR SELECT TO authenticated
USING (
  public.company_has_paid_tier(auth.uid())
  AND public.company_has_applicant_relationship(auth.uid(), officer_id)
);

DROP POLICY IF EXISTS "Companies review applicant work history" ON public.work_history;
CREATE POLICY "Companies review applicant work history"
ON public.work_history FOR SELECT TO authenticated
USING (
  public.company_has_paid_tier(auth.uid())
  AND public.company_has_applicant_relationship(auth.uid(), officer_id)
);

DROP POLICY IF EXISTS "Companies review applicant photos" ON storage.objects;
CREATE POLICY "Companies review applicant photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'officer-photos'
  AND public.company_has_paid_tier(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.user_id::text = (storage.foldername(name))[1]
      AND public.company_has_applicant_relationship(auth.uid(), op.id)
  )
);

DROP POLICY IF EXISTS "Companies review applicant certification documents" ON storage.objects;
DROP POLICY IF EXISTS "Premium companies can view certification documents" ON storage.objects;
CREATE POLICY "Companies review applicant certification documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'certification-documents'
  AND public.company_has_paid_tier(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.officer_profiles op
    WHERE op.user_id::text = (storage.foldername(name))[1]
      AND public.company_has_applicant_relationship(auth.uid(), op.id)
  )
);
