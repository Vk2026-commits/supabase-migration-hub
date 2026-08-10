-- Create a SECURITY DEFINER function to check if a company received job applications from an officer
-- This breaks the circular RLS dependency between officer_profiles and job_applications
CREATE OR REPLACE FUNCTION public.company_received_application(_company_user_id uuid, _officer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM job_applications ja
    JOIN job_postings jp ON ja.job_posting_id = jp.id
    JOIN company_profiles cp ON jp.company_id = cp.id
    WHERE cp.user_id = _company_user_id AND ja.officer_id = _officer_id
  )
$$;

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Companies can view officer details with authorization" ON public.officer_profiles;

-- Recreate the policy using the SECURITY DEFINER function instead of inline EXISTS
CREATE POLICY "Companies can view officer details with authorization" 
ON public.officer_profiles 
FOR SELECT 
USING (
  (auth.uid() = user_id) 
  OR company_hired_officer(auth.uid(), id) 
  OR company_received_application(auth.uid(), id)
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'view_only'::app_role) 
  OR has_role(auth.uid(), 'full_access'::app_role)
);