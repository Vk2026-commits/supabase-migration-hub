-- Create storage bucket for certification documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('certification-documents', 'certification-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for certification documents
CREATE POLICY "Officers can upload own certification documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'certification-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can update own certification documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'certification-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can delete own certification documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'certification-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can view own certification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'certification-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Premium companies can view certification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'certification-documents' AND
  EXISTS (
    SELECT 1 FROM company_profiles
    WHERE company_profiles.user_id = auth.uid()
    AND company_profiles.subscription_tier = 'premium'
  )
);

-- Add columns to certifications table for document uploads
ALTER TABLE certifications 
ADD COLUMN IF NOT EXISTS document_front_url TEXT,
ADD COLUMN IF NOT EXISTS document_back_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN certifications.document_front_url IS 'URL to front of certification document/license';
COMMENT ON COLUMN certifications.document_back_url IS 'URL to back of certification document/license';
COMMENT ON COLUMN certifications.description IS 'Brief description of the training or certification';