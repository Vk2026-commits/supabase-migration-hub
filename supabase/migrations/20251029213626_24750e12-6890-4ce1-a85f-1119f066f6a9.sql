-- Drop the existing public view policy for officer profiles
DROP POLICY IF EXISTS "Public can view basic officer info" ON public.officer_profiles;

-- Create new policy allowing only companies to view officer profiles
CREATE POLICY "Companies can view officer profiles"
ON public.officer_profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.company_profiles
    WHERE company_profiles.user_id = auth.uid()
  )
);

-- Update profiles table policies to prevent officers from viewing company profiles
DROP POLICY IF EXISTS "Officers can view company profiles" ON public.profiles;

-- Create new policy that only allows officers to view their own profile and other officer profiles (not companies)
CREATE POLICY "Officers can view own and officer profiles"
ON public.profiles
FOR SELECT
USING (
  (auth.uid() = id) OR
  (EXISTS (
    SELECT 1 FROM public.officer_profiles
    WHERE officer_profiles.user_id = auth.uid()
  ) AND role = 'officer')
);