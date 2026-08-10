-- Fix 1: Make officer photo storage buckets private and update policies
UPDATE storage.buckets 
SET public = false 
WHERE id IN ('officer-avatars', 'officer-photos');

-- Remove wide-open SELECT policies if they exist
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Officer photos are publicly accessible" ON storage.objects;

-- Ensure proper RLS policies exist for avatars (officers own + companies with authorization)
DROP POLICY IF EXISTS "Officers can view any avatar" ON storage.objects;
CREATE POLICY "Officers can view any avatar"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'officer-avatars' 
  AND auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Officers can upload own avatar" ON storage.objects;
CREATE POLICY "Officers can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'officer-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT op.id::text FROM officer_profiles op WHERE op.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Officers can update own avatar" ON storage.objects;
CREATE POLICY "Officers can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'officer-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT op.id::text FROM officer_profiles op WHERE op.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Officers can delete own avatar" ON storage.objects;
CREATE POLICY "Officers can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'officer-avatars'
  AND (storage.foldername(name))[1] IN (
    SELECT op.id::text FROM officer_profiles op WHERE op.user_id = auth.uid()
  )
);

-- Fix 2: Add server-side validation constraints

-- Message length constraint (prevent database bloat)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS message_length_check;
ALTER TABLE messages ADD CONSTRAINT message_length_check 
CHECK (LENGTH(message) > 0 AND LENGTH(message) <= 10000);

-- Job posting salary validation
ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS salary_range_check;
ALTER TABLE job_postings ADD CONSTRAINT salary_range_check
CHECK (
  (hourly_rate_min IS NULL OR hourly_rate_min >= 0) AND
  (hourly_rate_max IS NULL OR hourly_rate_max >= 0) AND
  (hourly_rate_min IS NULL OR hourly_rate_max IS NULL OR hourly_rate_max >= hourly_rate_min)
);

-- Job posting title length
ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS title_length_check;
ALTER TABLE job_postings ADD CONSTRAINT title_length_check
CHECK (LENGTH(title) > 0 AND LENGTH(title) <= 200);

-- Officer profile constraints
ALTER TABLE officer_profiles DROP CONSTRAINT IF EXISTS years_experience_check;
ALTER TABLE officer_profiles ADD CONSTRAINT years_experience_check
CHECK (years_experience IS NULL OR years_experience >= 0);

ALTER TABLE officer_profiles DROP CONSTRAINT IF EXISTS hourly_rate_check;
ALTER TABLE officer_profiles ADD CONSTRAINT hourly_rate_check
CHECK (hourly_rate IS NULL OR hourly_rate >= 0);

-- Work history date validation using trigger instead of CHECK (immutability issue)
CREATE OR REPLACE FUNCTION validate_work_history_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'End date cannot be before start date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS validate_work_history_dates_trigger ON work_history;
CREATE TRIGGER validate_work_history_dates_trigger
BEFORE INSERT OR UPDATE ON work_history
FOR EACH ROW EXECUTE FUNCTION validate_work_history_dates();

-- Evaluation rating constraints
ALTER TABLE evaluations DROP CONSTRAINT IF EXISTS rating_range_check;
ALTER TABLE evaluations ADD CONSTRAINT rating_range_check
CHECK (
  (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)) AND
  (attendance_rating IS NULL OR (attendance_rating >= 1 AND attendance_rating <= 5)) AND
  (reliability_rating IS NULL OR (reliability_rating >= 1 AND reliability_rating <= 5)) AND
  (professionalism_rating IS NULL OR (professionalism_rating >= 1 AND professionalism_rating <= 5)) AND
  (quality_of_work_rating IS NULL OR (quality_of_work_rating >= 1 AND quality_of_work_rating <= 5))
);