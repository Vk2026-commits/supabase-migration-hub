-- Add admin RLS policies for viewing all profiles

-- Allow admins to view all officer profiles
CREATE POLICY "Admins can view all officer profiles"
ON public.officer_profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all company profiles
CREATE POLICY "Admins can view all company profiles"
ON public.company_profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));