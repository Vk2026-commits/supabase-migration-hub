-- Officers with an open dashboard should receive newly sent or revised offers
-- immediately. The dashboard also revalidates on focus as a fallback.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'employment_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employment_offers;
  END IF;
END;
$$;
