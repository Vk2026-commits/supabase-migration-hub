-- Create trigger to automatically set trial dates for new company profiles
CREATE OR REPLACE FUNCTION public.set_company_trial_dates()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set trial dates if this is a new company and they don't already have trial dates
  IF NEW.subscription_tier = 'free' AND NEW.trial_start_date IS NULL THEN
    NEW.trial_start_date := NOW();
    NEW.trial_end_date := NOW() + INTERVAL '30 days';
    NEW.subscription_status := 'trial';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on company_profiles INSERT
DROP TRIGGER IF EXISTS set_trial_dates_on_insert ON public.company_profiles;
CREATE TRIGGER set_trial_dates_on_insert
  BEFORE INSERT ON public.company_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_trial_dates();

-- Update existing free tier companies that don't have trial dates
UPDATE public.company_profiles
SET 
  trial_start_date = created_at,
  trial_end_date = created_at + INTERVAL '30 days',
  subscription_status = CASE 
    WHEN created_at + INTERVAL '30 days' > NOW() THEN 'trial'
    ELSE 'expired'
  END
WHERE subscription_tier = 'free' 
  AND trial_start_date IS NULL;