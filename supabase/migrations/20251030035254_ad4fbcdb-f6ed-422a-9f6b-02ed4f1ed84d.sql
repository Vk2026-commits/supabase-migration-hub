-- Update RLS policy to allow officers to insert their own profile
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Officers can insert own profile" ON public.officer_profiles;

-- Recreate with correct permissions
CREATE POLICY "Officers can insert own profile"
ON public.officer_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);