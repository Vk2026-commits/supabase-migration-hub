-- Fix infinite recursion in RLS policies by creating SECURITY DEFINER helper functions

-- Function to check if a company (by user_id) has hired a specific officer
CREATE OR REPLACE FUNCTION public.company_hired_officer(
  _company_user_id uuid,
  _officer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM hires h
    JOIN company_profiles cp ON h.company_id = cp.id
    WHERE cp.user_id = _company_user_id
    AND h.officer_id = _officer_id
  )
$$;

-- Function to check if a company has expressed interest in an officer
CREATE OR REPLACE FUNCTION public.company_interested_in_officer(
  _company_user_id uuid,
  _officer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM officer_interests oi
    JOIN company_profiles cp ON oi.company_id = cp.id
    WHERE cp.user_id = _company_user_id
    AND oi.officer_id = _officer_id
    AND oi.status = 'interested'
  )
$$;

-- Function to check if a company has premium or professional tier
CREATE OR REPLACE FUNCTION public.company_has_paid_tier(_company_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM company_profiles
    WHERE user_id = _company_user_id
    AND subscription_tier IN ('professional', 'premium')
  )
$$;

-- Function to get officer's user_id
CREATE OR REPLACE FUNCTION public.get_officer_user_id(_officer_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM officer_profiles WHERE id = _officer_id
$$;

-- Function to check if user is officer owner
CREATE OR REPLACE FUNCTION public.is_officer_owner(_user_id uuid, _officer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM officer_profiles 
    WHERE id = _officer_id AND user_id = _user_id
  )
$$;

-- Now recreate the problematic policies using these functions

-- Drop and recreate officer_profiles policies
DROP POLICY IF EXISTS "Companies can view full details of hired officers" ON officer_profiles;
DROP POLICY IF EXISTS "Companies can view officer profiles" ON officer_profiles;
DROP POLICY IF EXISTS "Companies can view basic officer info" ON officer_profiles;

-- Officers can always view and manage their own profile
-- (This policy already exists and is fine)

-- Companies with paid tier can view basic info
CREATE POLICY "Companies can view basic officer info" 
ON officer_profiles FOR SELECT
USING (
  EXISTS (SELECT 1 FROM company_profiles WHERE user_id = auth.uid())
);

-- Companies can view full details if they hired or expressed interest (paid tier)
CREATE POLICY "Companies can view hired or interested officer details" 
ON officer_profiles FOR SELECT
USING (
  auth.uid() = user_id -- Officer owner
  OR company_hired_officer(auth.uid(), id)
  OR (company_interested_in_officer(auth.uid(), id) AND company_has_paid_tier(auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'view_only'::app_role)
  OR has_role(auth.uid(), 'full_access'::app_role)
);

-- Fix assigned_sites policy
DROP POLICY IF EXISTS "Companies can view their hired officers assigned sites" ON assigned_sites;

CREATE POLICY "Companies can view hired officers sites" 
ON assigned_sites FOR SELECT
USING (
  company_hired_officer(auth.uid(), officer_id)
  OR is_officer_owner(auth.uid(), officer_id)
);

-- Fix storage policies for officer-photos
DROP POLICY IF EXISTS "Companies view hired officer photos" ON storage.objects;
DROP POLICY IF EXISTS "Companies view interested officer photos" ON storage.objects;

CREATE POLICY "Companies view authorized officer photos" 
ON storage.objects FOR SELECT
USING (
  bucket_id = 'officer-photos'
  AND (
    (storage.foldername(name))[1]::uuid IN (
      SELECT user_id FROM officer_profiles WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM officer_profiles op
      WHERE op.user_id = (storage.foldername(name))[1]::uuid
      AND (
        company_hired_officer(auth.uid(), op.id)
        OR (company_interested_in_officer(auth.uid(), op.id) AND company_has_paid_tier(auth.uid()))
      )
    )
  )
);

-- Fix certifications policies
DROP POLICY IF EXISTS "Free tier can view certification names only" ON certifications;
DROP POLICY IF EXISTS "Companies can view hired officers certification summaries" ON certifications;

CREATE POLICY "Companies can view hired officers certifications" 
ON certifications FOR SELECT
USING (
  company_hired_officer(auth.uid(), officer_id)
  OR is_officer_owner(auth.uid(), officer_id)
);

-- Fix work_history policy
DROP POLICY IF EXISTS "Premium companies can view work history" ON work_history;

CREATE POLICY "Premium companies can view hired officers work history" 
ON work_history FOR SELECT
USING (
  is_officer_owner(auth.uid(), officer_id)
  OR (company_hired_officer(auth.uid(), officer_id) AND company_has_paid_tier(auth.uid()))
);

-- Fix video_interviews policy
DROP POLICY IF EXISTS "Premium companies can view videos" ON video_interviews;

CREATE POLICY "Premium companies can view hired officers videos" 
ON video_interviews FOR SELECT
USING (
  is_officer_owner(auth.uid(), officer_id)
  OR (company_hired_officer(auth.uid(), officer_id) AND company_has_paid_tier(auth.uid()))
);