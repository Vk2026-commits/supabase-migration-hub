-- Create evaluations table to track performance reviews
CREATE TABLE public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id UUID NOT NULL REFERENCES public.hires(id) ON DELETE CASCADE,
  evaluation_period TEXT NOT NULL CHECK (evaluation_period IN ('30_day', '90_day', '1_year')),
  due_date DATE NOT NULL,
  sent_date TIMESTAMP WITH TIME ZONE,
  completed_date TIMESTAMP WITH TIME ZONE,
  
  -- Performance ratings (1-5 scale)
  overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
  attendance_rating INTEGER CHECK (attendance_rating >= 1 AND attendance_rating <= 5),
  reliability_rating INTEGER CHECK (reliability_rating >= 1 AND reliability_rating <= 5),
  professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
  quality_of_work_rating INTEGER CHECK (quality_of_work_rating >= 1 AND quality_of_work_rating <= 5),
  
  -- Feedback
  performance_notes TEXT,
  areas_of_improvement TEXT,
  would_rehire BOOLEAN,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(hire_id, evaluation_period)
);

-- Enable RLS
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Companies can view and manage evaluations for their hires
CREATE POLICY "Companies can manage their evaluations"
ON public.evaluations
FOR ALL
USING (
  hire_id IN (
    SELECT id FROM public.hires WHERE hired_by_user_id = auth.uid()
  )
);

-- Officers can view evaluations about them
CREATE POLICY "Officers can view their evaluations"
ON public.evaluations
FOR SELECT
USING (
  hire_id IN (
    SELECT h.id 
    FROM public.hires h
    JOIN public.officer_profiles op ON h.officer_id = op.id
    WHERE op.user_id = auth.uid()
  )
);

-- Admins can view all evaluations
CREATE POLICY "Admins can view all evaluations"
ON public.evaluations
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Create trigger to auto-generate evaluation records when hire is created
CREATE OR REPLACE FUNCTION public.create_evaluation_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create 30-day evaluation
  INSERT INTO public.evaluations (hire_id, evaluation_period, due_date)
  VALUES (NEW.id, '30_day', NEW.hire_date + INTERVAL '30 days');
  
  -- Create 90-day evaluation
  INSERT INTO public.evaluations (hire_id, evaluation_period, due_date)
  VALUES (NEW.id, '90_day', NEW.hire_date + INTERVAL '90 days');
  
  -- Create 1-year evaluation
  INSERT INTO public.evaluations (hire_id, evaluation_period, due_date)
  VALUES (NEW.id, '1_year', NEW.hire_date + INTERVAL '1 year');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_evaluation_schedule_trigger
AFTER INSERT ON public.hires
FOR EACH ROW
EXECUTE FUNCTION public.create_evaluation_schedule();

-- Create updated_at trigger
CREATE TRIGGER update_evaluations_updated_at
BEFORE UPDATE ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();