-- Add missing SELECT policy so officers can read their own profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='officer_profiles' AND policyname='Officers can view own profile'
  ) THEN
    CREATE POLICY "Officers can view own profile"
    ON public.officer_profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END
$$;