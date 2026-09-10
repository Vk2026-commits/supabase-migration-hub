-- Resolve one existing account for a company invitation without exposing auth.users
-- or relying on the Auth Admin API's paginated user-directory scan.
CREATE OR REPLACE FUNCTION public.find_company_team_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_company_team_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_company_team_user_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.find_company_team_user_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_company_team_user_by_email(text) TO service_role;
