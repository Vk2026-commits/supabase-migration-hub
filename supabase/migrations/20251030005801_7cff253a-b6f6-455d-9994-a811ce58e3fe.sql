-- Add account_status column to officer_profiles
ALTER TABLE public.officer_profiles 
ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'cancelled', 'deleted'));

-- Add account_status column to company_profiles
ALTER TABLE public.company_profiles 
ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'cancelled', 'deleted'));

-- Create index for faster queries on account_status
CREATE INDEX IF NOT EXISTS idx_officer_profiles_account_status ON public.officer_profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_company_profiles_account_status ON public.company_profiles(account_status);

-- Update RLS policies to allow admins to update account status
CREATE POLICY "Admins can update account status for officers" 
ON public.officer_profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update account status for companies" 
ON public.company_profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));