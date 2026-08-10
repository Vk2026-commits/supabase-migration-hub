-- Allow admins to view all certifications
CREATE POLICY "Admins can view all certifications"
ON public.certifications
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all work history
CREATE POLICY "Admins can view all work history"
ON public.work_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));