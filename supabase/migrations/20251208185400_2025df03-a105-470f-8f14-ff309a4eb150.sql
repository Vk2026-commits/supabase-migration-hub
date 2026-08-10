-- Fix profiles table: Only expose email when company has valid relationship
DROP POLICY IF EXISTS "Companies can view limited officer profiles" ON public.profiles;

-- New policy: Companies can only view officer profiles (including email) when authorized
CREATE POLICY "Companies can view officer profiles with authorization" 
ON public.profiles 
FOR SELECT 
USING (
  -- Users can always view their own profile
  (auth.uid() = id)
  OR
  -- Companies can view officer profiles only if they have valid contact authorization
  (
    EXISTS (SELECT 1 FROM company_profiles WHERE company_profiles.user_id = auth.uid())
    AND role = 'officer'::user_role
    AND id <> auth.uid()
    AND company_can_view_officer_contact(auth.uid(), (
      SELECT op.id FROM officer_profiles op WHERE op.user_id = profiles.id
    ))
  )
);

-- Fix officer_profiles table: Tighten PII access to require hire or job application
DROP POLICY IF EXISTS "Companies can view hired or interested officer details" ON public.officer_profiles;

-- New policy: Companies can view full officer details only with proper authorization
-- This removes the "interested" condition that was too permissive
CREATE POLICY "Companies can view officer details with authorization" 
ON public.officer_profiles 
FOR SELECT 
USING (
  -- Officers can view their own profile
  (auth.uid() = user_id)
  OR
  -- Company has hired the officer
  company_hired_officer(auth.uid(), id)
  OR
  -- Officer applied to company's job posting
  EXISTS (
    SELECT 1 FROM job_applications ja
    JOIN job_postings jp ON ja.job_posting_id = jp.id
    JOIN company_profiles cp ON jp.company_id = cp.id
    WHERE cp.user_id = auth.uid() AND ja.officer_id = officer_profiles.id
  )
  OR
  -- Admin and special roles
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'view_only'::app_role)
  OR has_role(auth.uid(), 'full_access'::app_role)
);