-- Create work_history table for officer employment records
CREATE TABLE public.work_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  officer_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  position_title TEXT,
  start_date DATE,
  end_date DATE,
  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  supervisor_name TEXT,
  supervisor_phone TEXT,
  company_phone TEXT,
  reason_for_leaving TEXT,
  job_description TEXT,
  may_contact BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.work_history ENABLE ROW LEVEL SECURITY;

-- Create policies for officer access
CREATE POLICY "Officers can view own work history"
ON public.work_history
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM officer_profiles WHERE id = work_history.officer_id
  )
);

CREATE POLICY "Officers can insert own work history"
ON public.work_history
FOR INSERT
WITH CHECK (
  auth.uid() IN (
    SELECT user_id FROM officer_profiles WHERE id = work_history.officer_id
  )
);

CREATE POLICY "Officers can update own work history"
ON public.work_history
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT user_id FROM officer_profiles WHERE id = work_history.officer_id
  )
);

CREATE POLICY "Officers can delete own work history"
ON public.work_history
FOR DELETE
USING (
  auth.uid() IN (
    SELECT user_id FROM officer_profiles WHERE id = work_history.officer_id
  )
);

-- Create policies for company access (premium tier)
CREATE POLICY "Premium companies can view work history"
ON public.work_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_profiles
    WHERE user_id = auth.uid()
    AND subscription_tier = 'premium'
  )
);

-- Add updated_at trigger
CREATE TRIGGER update_work_history_updated_at
  BEFORE UPDATE ON public.work_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();