-- Add payment tracking fields to company_profiles
ALTER TABLE public.company_profiles 
ADD COLUMN IF NOT EXISTS payment_due_date date,
ADD COLUMN IF NOT EXISTS last_payment_date date,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'current' CHECK (payment_status IN ('current', 'overdue', 'suspended'));

-- Create index for payment queries
CREATE INDEX IF NOT EXISTS idx_company_profiles_payment_status ON public.company_profiles(payment_status);
CREATE INDEX IF NOT EXISTS idx_company_profiles_payment_due_date ON public.company_profiles(payment_due_date);

-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to check and suspend overdue accounts
CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update companies with overdue payments
  UPDATE public.company_profiles
  SET 
    account_status = 'paused',
    payment_status = 'suspended'
  WHERE 
    payment_due_date < CURRENT_DATE
    AND payment_status = 'overdue'
    AND account_status = 'active';
    
  -- Mark companies as overdue if payment is due
  UPDATE public.company_profiles
  SET payment_status = 'overdue'
  WHERE 
    payment_due_date < CURRENT_DATE
    AND payment_status = 'current'
    AND account_status = 'active';
END;
$$;

-- Schedule daily check for overdue payments at midnight
SELECT cron.schedule(
  'check-overdue-payments-daily',
  '0 0 * * *',
  $$SELECT public.check_overdue_payments();$$
);