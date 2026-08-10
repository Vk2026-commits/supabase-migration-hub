-- Drop the existing public access policy
DROP POLICY IF EXISTS "Anyone can view active job postings" ON public.job_postings;

-- Create new policy requiring authentication to view job postings
CREATE POLICY "Authenticated users can view active job postings" 
ON public.job_postings 
FOR SELECT 
USING (
  (status = 'active'::text) AND (auth.uid() IS NOT NULL)
);