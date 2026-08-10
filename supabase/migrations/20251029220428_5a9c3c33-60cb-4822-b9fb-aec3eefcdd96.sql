-- Add trial and subscription tracking to company_profiles
ALTER TABLE public.company_profiles
ADD COLUMN IF NOT EXISTS trial_start_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS trial_end_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS subscription_start_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free' CHECK (subscription_status IN ('free', 'trial', 'active', 'expired'));

-- Create index for faster subscription queries
CREATE INDEX IF NOT EXISTS idx_company_profiles_subscription_status ON public.company_profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_company_profiles_trial_end_date ON public.company_profiles(trial_end_date);