-- Update RLS policies to support view_only and full_access roles

-- Allow view_only and full_access users to view officer profiles
CREATE POLICY "View only users can view officer profiles" ON public.officer_profiles
FOR SELECT USING (
  has_role(auth.uid(), 'view_only'::app_role) OR 
  has_role(auth.uid(), 'full_access'::app_role)
);

-- Allow view_only and full_access users to view company profiles
CREATE POLICY "View only users can view company profiles" ON public.company_profiles
FOR SELECT USING (
  has_role(auth.uid(), 'view_only'::app_role) OR 
  has_role(auth.uid(), 'full_access'::app_role)
);

-- Allow full_access users to update officer profiles
CREATE POLICY "Full access users can update officer profiles" ON public.officer_profiles
FOR UPDATE USING (has_role(auth.uid(), 'full_access'::app_role));

-- Allow full_access users to update company profiles
CREATE POLICY "Full access users can update company profiles" ON public.company_profiles
FOR UPDATE USING (has_role(auth.uid(), 'full_access'::app_role));

-- Allow view_only and full_access users to view all profiles
CREATE POLICY "View only users can view profiles" ON public.profiles
FOR SELECT USING (
  has_role(auth.uid(), 'view_only'::app_role) OR 
  has_role(auth.uid(), 'full_access'::app_role)
);

-- Allow view_only and full_access users to view hires
CREATE POLICY "View only users can view hires" ON public.hires
FOR SELECT USING (
  has_role(auth.uid(), 'view_only'::app_role) OR 
  has_role(auth.uid(), 'full_access'::app_role)
);

-- Allow full_access users to manage hires
CREATE POLICY "Full access users can manage hires" ON public.hires
FOR ALL USING (has_role(auth.uid(), 'full_access'::app_role));