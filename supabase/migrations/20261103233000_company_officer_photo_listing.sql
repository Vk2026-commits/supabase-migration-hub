-- Use an indexed prefix read instead of the storage directory listing query.
-- SECURITY INVOKER preserves all existing storage row-level policies.
CREATE OR REPLACE FUNCTION public.list_visible_officer_photos(_user_id uuid)
RETURNS TABLE(name text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT split_part(o.name, '/', 2) AS name
  FROM storage.objects o
  WHERE o.bucket_id = 'officer-photos'
    AND o.name LIKE _user_id::text || '/%'
    AND split_part(o.name, '/', 3) = '';
$$;
REVOKE ALL ON FUNCTION public.list_visible_officer_photos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_visible_officer_photos(uuid) TO authenticated;
