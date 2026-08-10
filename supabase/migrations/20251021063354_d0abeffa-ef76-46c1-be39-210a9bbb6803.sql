-- Create officer interests table for tracking company interest
CREATE TABLE public.officer_interests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES officer_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('interested', 'not_interested')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(company_id, officer_id)
);

-- Enable RLS
ALTER TABLE public.officer_interests ENABLE ROW LEVEL SECURITY;

-- Companies can manage their own interests
CREATE POLICY "Companies can manage their interests"
ON public.officer_interests
FOR ALL
USING (
  company_id IN (
    SELECT id FROM company_profiles WHERE user_id = auth.uid()
  )
);

-- Officers can view interest in them
CREATE POLICY "Officers can view interest in them"
ON public.officer_interests
FOR SELECT
USING (
  officer_id IN (
    SELECT id FROM officer_profiles WHERE user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_officer_interests_updated_at
BEFORE UPDATE ON public.officer_interests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();