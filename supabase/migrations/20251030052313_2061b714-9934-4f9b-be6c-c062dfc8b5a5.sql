-- Fix RLS policy for job_applications insert
-- The issue is that the INSERT policy has a USING expression instead of WITH CHECK

-- Drop the existing policy
DROP POLICY IF EXISTS "Officers can create applications" ON job_applications;

-- Recreate with correct WITH CHECK expression for INSERT
CREATE POLICY "Officers can create applications"
ON job_applications
FOR INSERT
WITH CHECK (
  officer_id IN (
    SELECT officer_profiles.id
    FROM officer_profiles
    WHERE officer_profiles.user_id = auth.uid()
  )
);