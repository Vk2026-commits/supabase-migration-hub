-- Store officer video interviews in a private bucket. Access mirrors the
-- existing video_interviews table: owners manage their own videos, qualified
-- hiring companies can view them, and administrators can review them.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-interviews',
  'video-interviews',
  false,
  52428800,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Officers upload own video interviews" ON storage.objects;
CREATE POLICY "Officers upload own video interviews"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'video-interviews'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Officers update own video interviews" ON storage.objects;
CREATE POLICY "Officers update own video interviews"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'video-interviews'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'video-interviews'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Officers delete own video interviews" ON storage.objects;
CREATE POLICY "Officers delete own video interviews"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'video-interviews'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Authorized users view video interviews" ON storage.objects;
CREATE POLICY "Authorized users view video interviews"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'video-interviews'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM officer_profiles op
      WHERE op.user_id::text = (storage.foldername(name))[1]
        AND company_hired_officer(auth.uid(), op.id)
        AND company_has_paid_tier(auth.uid())
    )
  )
);
