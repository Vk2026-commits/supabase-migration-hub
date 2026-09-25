-- Officers should not pay the cost of company-review RLS policies when
-- restoring their own certification form. Ownership is checked inside this
-- narrowly scoped SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.get_my_certifications()
RETURNS SETOF public.certifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT certification.*
  FROM public.certifications certification
  JOIN public.officer_profiles officer ON officer.id = certification.officer_id
  WHERE officer.user_id = auth.uid()
  ORDER BY certification.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_certifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_certifications() TO authenticated;
