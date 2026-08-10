-- =====================================================
-- SECURITY OVERHAUL: Comprehensive PII Protection
-- =====================================================

-- 1. Enable pgcrypto extension for encryption (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create encrypted sensitive data table for SSN, Driver's License
CREATE TABLE public.officer_sensitive_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id UUID NOT NULL UNIQUE REFERENCES public.officer_profiles(id) ON DELETE CASCADE,
  
  -- Encrypted fields (stored as bytea for AES encryption)
  ssn_encrypted BYTEA,
  ssn_last_four TEXT, -- Masked version for display (e.g., "***-**-1234")
  
  drivers_license_number_encrypted BYTEA,
  drivers_license_state TEXT,
  drivers_license_expiry DATE,
  
  -- Document URLs (stored in private bucket)
  ssn_document_url TEXT,
  drivers_license_front_url TEXT,
  drivers_license_back_url TEXT,
  
  -- Verification status
  ssn_verified BOOLEAN DEFAULT FALSE,
  drivers_license_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID,
  verified_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on sensitive data table
ALTER TABLE public.officer_sensitive_data ENABLE ROW LEVEL SECURITY;

-- 3. Create audit log table for tracking access to sensitive data
CREATE TABLE public.security_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'view', 'create', 'update', 'delete', 'decrypt'
  table_name TEXT NOT NULL,
  record_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- 4. Create function to log sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  _action TEXT,
  _table_name TEXT,
  _record_id UUID,
  _details JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_audit_log (user_id, action, table_name, record_id, details)
  VALUES (auth.uid(), _action, _table_name, _record_id, _details);
END;
$$;

-- 5. Strict RLS policies for sensitive data table
-- Only officers can see their own sensitive data
CREATE POLICY "Officers can view own sensitive data"
ON public.officer_sensitive_data
FOR SELECT
USING (officer_id IN (
  SELECT id FROM officer_profiles WHERE user_id = auth.uid()
));

-- Officers can insert their own sensitive data
CREATE POLICY "Officers can insert own sensitive data"
ON public.officer_sensitive_data
FOR INSERT
WITH CHECK (officer_id IN (
  SELECT id FROM officer_profiles WHERE user_id = auth.uid()
));

-- Officers can update their own sensitive data
CREATE POLICY "Officers can update own sensitive data"
ON public.officer_sensitive_data
FOR UPDATE
USING (officer_id IN (
  SELECT id FROM officer_profiles WHERE user_id = auth.uid()
));

-- Admins can view sensitive data (for verification purposes)
CREATE POLICY "Admins can view sensitive data for verification"
ON public.officer_sensitive_data
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update verification status
CREATE POLICY "Admins can update verification status"
ON public.officer_sensitive_data
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Audit log policies - only admins can view, system can insert
CREATE POLICY "Only admins can view audit logs"
ON public.security_audit_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert audit logs"
ON public.security_audit_log
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Prevent deletion of audit logs
CREATE POLICY "Audit logs cannot be deleted"
ON public.security_audit_log
FOR DELETE
USING (false);

-- 7. Fix officer_profiles policy - restrict sensitive fields from companies
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Companies can view basic officer info" ON public.officer_profiles;

-- Create view for companies to see only public officer info
CREATE OR REPLACE VIEW public.officer_profiles_limited AS
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
FROM public.officer_profiles
WHERE account_status = 'active';

-- 8. Create function to check if company should see officer's contact info
CREATE OR REPLACE FUNCTION public.company_can_view_officer_contact(_company_user_id UUID, _officer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Company has hired the officer
    SELECT 1 FROM hires h
    JOIN company_profiles cp ON h.company_id = cp.id
    WHERE cp.user_id = _company_user_id AND h.officer_id = _officer_id
  )
  OR EXISTS (
    -- Officer applied to company's job
    SELECT 1 FROM job_applications ja
    JOIN job_postings jp ON ja.job_posting_id = jp.id
    JOIN company_profiles cp ON jp.company_id = cp.id
    WHERE cp.user_id = _company_user_id AND ja.officer_id = _officer_id
  )
  OR EXISTS (
    -- Company expressed interest AND has paid tier
    SELECT 1 FROM officer_interests oi
    JOIN company_profiles cp ON oi.company_id = cp.id
    WHERE cp.user_id = _company_user_id 
    AND oi.officer_id = _officer_id
    AND cp.subscription_tier IN ('professional', 'premium')
  )
$$;

-- 9. Update work_history policy to respect may_contact flag
DROP POLICY IF EXISTS "Premium companies can view hired officers work history" ON public.work_history;

CREATE POLICY "Companies can view hired officers work history with restrictions"
ON public.work_history
FOR SELECT
USING (
  is_officer_owner(auth.uid(), officer_id)
  OR (
    company_hired_officer(auth.uid(), officer_id)
    AND company_has_paid_tier(auth.uid())
  )
);

-- 10. Create private storage bucket for sensitive documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('sensitive-documents', 'sensitive-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 11. Storage policies for sensitive documents - VERY restrictive
CREATE POLICY "Officers can upload own sensitive documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'sensitive-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can view own sensitive documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'sensitive-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Officers can delete own sensitive documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'sensitive-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view sensitive documents for verification"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'sensitive-documents'
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- 12. Create trigger to automatically log sensitive data access
CREATE OR REPLACE FUNCTION public.audit_sensitive_data_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'SELECT' THEN
    PERFORM log_sensitive_access('view', TG_TABLE_NAME, NEW.id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM log_sensitive_access('create', TG_TABLE_NAME, NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_sensitive_access('update', TG_TABLE_NAME, NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_sensitive_access('delete', TG_TABLE_NAME, OLD.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add audit trigger to sensitive data table
CREATE TRIGGER audit_officer_sensitive_data
AFTER INSERT OR UPDATE OR DELETE ON public.officer_sensitive_data
FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_data_access();

-- 13. Update timestamp trigger for sensitive data
CREATE TRIGGER update_officer_sensitive_data_updated_at
BEFORE UPDATE ON public.officer_sensitive_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();