-- Add UPDATE policy for officers to update their own job applications
CREATE POLICY "Officers can update own applications"
ON public.job_applications
FOR UPDATE
USING (
  officer_id IN (
    SELECT id 
    FROM officer_profiles 
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  officer_id IN (
    SELECT id 
    FROM officer_profiles 
    WHERE user_id = auth.uid()
  )
);