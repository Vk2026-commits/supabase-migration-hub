-- Create storage buckets for officer photos
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('officer-avatars', 'officer-avatars', true),
  ('officer-photos', 'officer-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for officer avatars
CREATE POLICY "Officers can upload own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'officer-avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'officer-avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can delete own avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'officer-avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'officer-avatars');

-- RLS policies for officer photos
CREATE POLICY "Officers can upload own photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'officer-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can update own photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'officer-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can delete own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'officer-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officer photos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'officer-photos');