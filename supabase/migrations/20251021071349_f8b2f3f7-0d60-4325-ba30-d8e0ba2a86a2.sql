-- Create job_postings table
CREATE TABLE public.job_postings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  employment_type TEXT[],
  shift_type TEXT[],
  hourly_rate_min NUMERIC,
  hourly_rate_max NUMERIC,
  requirements TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create job_applications table
CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_posting_id UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES public.officer_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'interested',
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(job_posting_id, officer_id)
);

-- Enable RLS
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_postings
CREATE POLICY "Anyone can view active job postings"
  ON public.job_postings
  FOR SELECT
  USING (status = 'active');

CREATE POLICY "Companies can manage their own job postings"
  ON public.job_postings
  FOR ALL
  USING (company_id IN (
    SELECT id FROM company_profiles WHERE user_id = auth.uid()
  ));

-- RLS Policies for job_applications
CREATE POLICY "Officers can create applications"
  ON public.job_applications
  FOR INSERT
  WITH CHECK (officer_id IN (
    SELECT id FROM officer_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Officers can view their own applications"
  ON public.job_applications
  FOR SELECT
  USING (officer_id IN (
    SELECT id FROM officer_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Companies can view applications for their jobs"
  ON public.job_applications
  FOR SELECT
  USING (job_posting_id IN (
    SELECT jp.id FROM job_postings jp
    JOIN company_profiles cp ON jp.company_id = cp.id
    WHERE cp.user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE TRIGGER update_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();