-- Add new columns to company_profiles table
ALTER TABLE company_profiles 
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS twitter_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS licensed_states text[],
  ADD COLUMN IF NOT EXISTS years_in_business text,
  ADD COLUMN IF NOT EXISTS year_founded integer,
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Create storage bucket for company logos if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for company logos
CREATE POLICY "Companies can upload their own logos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'company-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Companies can update their own logos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'company-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Company logos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'company-logos');