-- Expose only the safe company and position fields officers need to select a
-- real hiring destination. Company profile contact and billing fields remain private.
CREATE OR REPLACE FUNCTION public.list_active_hiring_destinations()
RETURNS TABLE (
  id uuid,
  company_id uuid,
  company_name text,
  "position" text,
  city text,
  state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jp.id,
    cp.id,
    trim(cp.company_name),
    jp.title,
    coalesce(nullif(trim(cp.company_city), ''), nullif(trim(split_part(jp.location, ',', 1)), ''), ''),
    coalesce(nullif(trim(cp.company_state), ''), nullif(trim(substring(jp.location from position(',' in jp.location) + 1)), ''), '')
  FROM public.job_postings jp
  JOIN public.company_profiles cp ON cp.id = jp.company_id
  WHERE jp.status = 'active'
    AND coalesce(cp.account_status, 'active') = 'active'
  ORDER BY cp.company_name, jp.title, jp.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_active_hiring_destinations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_hiring_destinations() TO authenticated;
