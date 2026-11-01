-- Read the current officer's photo names through PostgREST rather than the
-- Storage listing endpoint. Retain the caller's existing storage RLS.
CREATE OR REPLACE FUNCTION public.get_my_officer_photos()
RETURNS TABLE(name text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT split_part(o.name, '/', 2) AS name
  FROM storage.objects o
  WHERE o.bucket_id = 'officer-photos'
    AND o.name LIKE (SELECT auth.uid())::text || '/%'
    AND split_part(o.name, '/', 1) = (SELECT auth.uid())::text
    AND split_part(o.name, '/', 3) = ''
    AND split_part(split_part(o.name, '/', 2), '.', 1)
      IN ('headshot', 'full-body', 'action-1', 'action-2')
  ORDER BY o.updated_at DESC, o.name
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.get_my_officer_photos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_officer_photos() TO authenticated;
