-- Fix: ensure officer_profiles_safe.hourly_rate matches existing view column numeric(10,2)

-- Create safe mirror table for minimal, non-sensitive profile fields
CREATE TABLE IF NOT EXISTS public.public_profiles (
  id uuid PRIMARY KEY,
  username text,
  full_name text,
  role public.user_role,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz
);

-- Create safe mirror table for officer profile data used by existing public/limited views
CREATE TABLE IF NOT EXISTS public.officer_profiles_safe (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  title text,
  bio text,
  employment_type text[],
  location text,
  availability_status text,
  shift_preference text[],
  years_experience integer,
  hourly_rate numeric(10,2),
  main_region text,
  avatar_url text,
  availability_schedule jsonb,
  account_status text,
  created_at timestamptz,
  updated_at timestamptz
);

-- If the table existed from a previous attempt, enforce the correct type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='officer_profiles_safe'
      AND column_name='hourly_rate'
      AND (numeric_precision IS DISTINCT FROM 10 OR numeric_scale IS DISTINCT FROM 2)
  ) THEN
    ALTER TABLE public.officer_profiles_safe
      ALTER COLUMN hourly_rate TYPE numeric(10,2);
  END IF;
END $$;

-- Create safe mirror table for officer certification summaries
CREATE TABLE IF NOT EXISTS public.officer_certifications_safe (
  certification_id uuid PRIMARY KEY,
  officer_id uuid,
  name text,
  certification_type text,
  license_level text,
  expiry_date date,
  issue_date date,
  issuing_organization text
);

CREATE INDEX IF NOT EXISTS idx_public_profiles_role ON public.public_profiles(role);
CREATE INDEX IF NOT EXISTS idx_officer_profiles_safe_user_id ON public.officer_profiles_safe(user_id);
CREATE INDEX IF NOT EXISTS idx_officer_certifications_safe_officer_id ON public.officer_certifications_safe(officer_id);

-- Enable RLS (read-only to authenticated users; writes happen via SECURITY DEFINER triggers)
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_profiles_safe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_certifications_safe ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='public_profiles' AND policyname='Authenticated can read public profiles'
  ) THEN
    CREATE POLICY "Authenticated can read public profiles"
    ON public.public_profiles
    FOR SELECT
    USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='officer_profiles_safe' AND policyname='Authenticated can read safe officer profiles'
  ) THEN
    CREATE POLICY "Authenticated can read safe officer profiles"
    ON public.officer_profiles_safe
    FOR SELECT
    USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='officer_certifications_safe' AND policyname='Authenticated can read safe officer certifications'
  ) THEN
    CREATE POLICY "Authenticated can read safe officer certifications"
    ON public.officer_certifications_safe
    FOR SELECT
    USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Ensure authenticated role can read underlying tables used by security-invoker views
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.officer_profiles_safe TO authenticated;
GRANT SELECT ON public.officer_certifications_safe TO authenticated;

-- Sync functions (SECURITY DEFINER so they can write regardless of the caller)
CREATE OR REPLACE FUNCTION public.sync_public_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_profiles WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.public_profiles (id, username, full_name, role, avatar_url, created_at, updated_at)
  VALUES (NEW.id, NEW.username, NEW.full_name, NEW.role, NEW.avatar_url, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    avatar_url = EXCLUDED.avatar_url,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_officer_profiles_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.officer_profiles_safe WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.officer_profiles_safe (
    id, user_id, title, bio, employment_type, location, availability_status,
    shift_preference, years_experience, hourly_rate, main_region, avatar_url,
    availability_schedule, account_status, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.user_id, NEW.title, NEW.bio, NEW.employment_type, NEW.location, NEW.availability_status,
    NEW.shift_preference, NEW.years_experience, NEW.hourly_rate, NEW.main_region, NEW.avatar_url,
    NEW.availability_schedule, NEW.account_status, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    title = EXCLUDED.title,
    bio = EXCLUDED.bio,
    employment_type = EXCLUDED.employment_type,
    location = EXCLUDED.location,
    availability_status = EXCLUDED.availability_status,
    shift_preference = EXCLUDED.shift_preference,
    years_experience = EXCLUDED.years_experience,
    hourly_rate = EXCLUDED.hourly_rate,
    main_region = EXCLUDED.main_region,
    avatar_url = EXCLUDED.avatar_url,
    availability_schedule = EXCLUDED.availability_schedule,
    account_status = EXCLUDED.account_status,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_officer_certifications_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.officer_certifications_safe WHERE certification_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.officer_certifications_safe (
    certification_id, officer_id, name, certification_type, license_level,
    expiry_date, issue_date, issuing_organization
  )
  VALUES (
    NEW.id, NEW.officer_id, NEW.name, NEW.certification_type, NEW.license_level,
    NEW.expiry_date, NEW.issue_date, NEW.issuing_organization
  )
  ON CONFLICT (certification_id) DO UPDATE SET
    officer_id = EXCLUDED.officer_id,
    name = EXCLUDED.name,
    certification_type = EXCLUDED.certification_type,
    license_level = EXCLUDED.license_level,
    expiry_date = EXCLUDED.expiry_date,
    issue_date = EXCLUDED.issue_date,
    issuing_organization = EXCLUDED.issuing_organization;

  RETURN NEW;
END;
$$;

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_public_profiles') THEN
    CREATE TRIGGER trg_sync_public_profiles
    AFTER INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_public_profiles();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_officer_profiles_safe') THEN
    CREATE TRIGGER trg_sync_officer_profiles_safe
    AFTER INSERT OR UPDATE OR DELETE ON public.officer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_officer_profiles_safe();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_officer_certifications_safe') THEN
    CREATE TRIGGER trg_sync_officer_certifications_safe
    AFTER INSERT OR UPDATE OR DELETE ON public.certifications
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_officer_certifications_safe();
  END IF;
END $$;

-- Backfill existing data
INSERT INTO public.public_profiles (id, username, full_name, role, avatar_url, created_at, updated_at)
SELECT id, username, full_name, role, avatar_url, created_at, updated_at
FROM public.profiles
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  avatar_url = EXCLUDED.avatar_url,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.officer_profiles_safe (
  id, user_id, title, bio, employment_type, location, availability_status,
  shift_preference, years_experience, hourly_rate, main_region, avatar_url,
  availability_schedule, account_status, created_at, updated_at
)
SELECT
  id, user_id, title, bio, employment_type, location, availability_status,
  shift_preference, years_experience, hourly_rate, main_region, avatar_url,
  availability_schedule, account_status, created_at, updated_at
FROM public.officer_profiles
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  title = EXCLUDED.title,
  bio = EXCLUDED.bio,
  employment_type = EXCLUDED.employment_type,
  location = EXCLUDED.location,
  availability_status = EXCLUDED.availability_status,
  shift_preference = EXCLUDED.shift_preference,
  years_experience = EXCLUDED.years_experience,
  hourly_rate = EXCLUDED.hourly_rate,
  main_region = EXCLUDED.main_region,
  avatar_url = EXCLUDED.avatar_url,
  availability_schedule = EXCLUDED.availability_schedule,
  account_status = EXCLUDED.account_status,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.officer_certifications_safe (
  certification_id, officer_id, name, certification_type, license_level,
  expiry_date, issue_date, issuing_organization
)
SELECT
  id as certification_id, officer_id, name, certification_type, license_level,
  expiry_date, issue_date, issuing_organization
FROM public.certifications
ON CONFLICT (certification_id) DO UPDATE SET
  officer_id = EXCLUDED.officer_id,
  name = EXCLUDED.name,
  certification_type = EXCLUDED.certification_type,
  license_level = EXCLUDED.license_level,
  expiry_date = EXCLUDED.expiry_date,
  issue_date = EXCLUDED.issue_date,
  issuing_organization = EXCLUDED.issuing_organization;

-- Recreate views as SECURITY INVOKER views over the safe mirror tables (same shape as before)
CREATE OR REPLACE VIEW public.safe_officer_profiles
WITH (security_invoker = true)
AS
SELECT id, username, full_name, role, avatar_url, created_at, updated_at
FROM public.public_profiles p
WHERE role = 'officer'::public.user_role;

CREATE OR REPLACE VIEW public.officer_profiles_public
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  title,
  bio,
  employment_type,
  location,
  availability_status,
  shift_preference,
  years_experience,
  hourly_rate,
  main_region,
  avatar_url,
  created_at,
  updated_at,
  availability_schedule
FROM public.officer_profiles_safe op;

CREATE OR REPLACE VIEW public.officer_profiles_limited
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  title,
  bio,
  years_experience,
  location,
  main_region,
  availability_status,
  employment_type,
  shift_preference,
  avatar_url,
  created_at,
  updated_at
FROM public.officer_profiles_safe
WHERE account_status = 'active'::text;

CREATE OR REPLACE VIEW public.officer_certifications_summary
WITH (security_invoker = true)
AS
SELECT
  officer_id,
  name,
  certification_type,
  license_level,
  expiry_date,
  issue_date,
  issuing_organization
FROM public.officer_certifications_safe c;
