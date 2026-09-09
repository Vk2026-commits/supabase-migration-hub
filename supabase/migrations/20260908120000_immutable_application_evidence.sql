-- Preserve the exact photo and credential files included with an employer copy.
-- Canonical officer uploads remain editable; evidence files and their manifests do not.
ALTER TABLE public.guard_hiring_applications
  ADD COLUMN IF NOT EXISTS evidence_snapshot_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS evidence_snapshot_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_snapshot_kind text;

ALTER TABLE public.guard_hiring_applications
  DROP CONSTRAINT IF EXISTS guard_hiring_applications_evidence_snapshot_status_check;
ALTER TABLE public.guard_hiring_applications
  ADD CONSTRAINT guard_hiring_applications_evidence_snapshot_status_check
  CHECK (evidence_snapshot_status IN ('pending', 'processing', 'complete', 'failed', 'legacy_unavailable'));

ALTER TABLE public.guard_hiring_applications
  DROP CONSTRAINT IF EXISTS guard_hiring_applications_evidence_snapshot_kind_check;
ALTER TABLE public.guard_hiring_applications
  ADD CONSTRAINT guard_hiring_applications_evidence_snapshot_kind_check
  CHECK (evidence_snapshot_kind IS NULL OR evidence_snapshot_kind IN ('submission', 'legacy'));

CREATE TABLE IF NOT EXISTS public.application_evidence_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hiring_application_id uuid NOT NULL REFERENCES public.guard_hiring_applications(id) ON DELETE RESTRICT,
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE RESTRICT,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('photo', 'certification')),
  evidence_role text NOT NULL,
  label text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  source_record_id uuid,
  storage_path text NOT NULL UNIQUE,
  is_required boolean NOT NULL DEFAULT false,
  archive_kind text NOT NULL CHECK (archive_kind IN ('submission', 'legacy')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (hiring_application_id, evidence_kind, evidence_role, source_path)
);

ALTER TABLE public.application_evidence_files ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS application_evidence_files_application_idx
  ON public.application_evidence_files(hiring_application_id, evidence_kind, evidence_role);

CREATE OR REPLACE FUNCTION public.can_view_application_evidence(_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.guard_hiring_applications gha
    WHERE gha.id = _application_id
      AND (
        gha.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'view_only'::public.app_role)
        OR public.has_role(auth.uid(), 'full_access'::public.app_role)
        OR (
          gha.job_application_id IS NOT NULL
          AND public.company_has_paid_tier(auth.uid())
          AND EXISTS (
            SELECT 1
            FROM public.job_applications ja
            JOIN public.job_postings jp ON jp.id = ja.job_posting_id
            JOIN public.company_profiles cp ON cp.id = jp.company_id
            WHERE ja.id = gha.job_application_id
              AND cp.user_id = auth.uid()
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_application_evidence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_application_evidence(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authorized users view application evidence" ON public.application_evidence_files;
CREATE POLICY "Authorized users view application evidence"
ON public.application_evidence_files FOR SELECT TO authenticated
USING (public.can_view_application_evidence(hiring_application_id));

CREATE OR REPLACE FUNCTION public.prevent_application_evidence_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Application evidence is immutable; create a new employer application snapshot instead';
END;
$$;

DROP TRIGGER IF EXISTS application_evidence_is_immutable ON public.application_evidence_files;
CREATE TRIGGER application_evidence_is_immutable
BEFORE UPDATE OR DELETE ON public.application_evidence_files
FOR EACH ROW EXECUTE FUNCTION public.prevent_application_evidence_changes();

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('application-evidence', 'application-evidence', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Authorized users view application evidence objects" ON storage.objects;
CREATE POLICY "Authorized users view application evidence objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'application-evidence'
  AND EXISTS (
    SELECT 1
    FROM public.application_evidence_files evidence
    WHERE evidence.storage_path = name
      AND public.can_view_application_evidence(evidence.hiring_application_id)
  )
);

-- Existing employer copies are archived lazily the first time an authorized
-- company or administrator opens them. The archive time is always disclosed.
UPDATE public.guard_hiring_applications
SET evidence_snapshot_status = 'pending', evidence_snapshot_kind = 'legacy'
WHERE application_type = 'employer_copy'
  AND submitted_at IS NOT NULL
  AND evidence_snapshot_completed_at IS NULL;
