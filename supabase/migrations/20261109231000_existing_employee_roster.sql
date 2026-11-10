-- Existing employment records, not new applicants. Importing never sends mail,
-- creates auth users, or grants company-team access.
CREATE TABLE IF NOT EXISTS public.company_employee_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 source_key text NOT NULL,
 first_name text NOT NULL,
 middle_name text NOT NULL DEFAULT '',
 last_name text NOT NULL,
 email text,
 phone text,
 position_title text,
 hire_date date,
 source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 linked_user_id uuid REFERENCES auth.users(id),
 linked_officer_id uuid REFERENCES public.officer_profiles(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','invited','claimed','complete')),
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,source_key)
);
ALTER TABLE public.company_employee_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_employee_imports FROM anon, authenticated;
GRANT SELECT(id,company_id,source_key,first_name,middle_name,last_name,email,phone,position_title,hire_date,linked_user_id,linked_officer_id,status,imported_at) ON public.company_employee_imports TO authenticated;
CREATE POLICY "Company staff read employee imports" ON public.company_employee_imports FOR SELECT TO authenticated
USING(public.company_team_has_access(company_id,ARRAY['owner','admin','hiring_manager','reviewer']::public.company_member_role[]));
COMMENT ON COLUMN public.company_employee_imports.source_data IS 'Private original roster. Not exposed by list API; never copied into public profiles without employee review.';
