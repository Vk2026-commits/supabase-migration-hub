-- Add desired_salary and resume_url fields to officer_profiles
ALTER TABLE officer_profiles
ADD COLUMN desired_salary numeric,
ADD COLUMN resume_url text;

-- Create storage bucket for resumes if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for resumes bucket
CREATE POLICY "Officers can upload their own resumes"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can view their own resumes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can update their own resumes"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can delete their own resumes"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Premium companies can view resumes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'resumes' AND
  EXISTS (
    SELECT 1 FROM company_profiles
    WHERE company_profiles.user_id = auth.uid()
    AND company_profiles.subscription_tier = 'premium'
  )
);