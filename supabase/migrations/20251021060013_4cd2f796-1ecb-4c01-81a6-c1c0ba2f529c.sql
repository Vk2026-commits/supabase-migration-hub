-- Create app_role enum for the role system
CREATE TYPE public.app_role AS ENUM ('admin', 'company', 'officer');

-- Create user_roles table for role-based access control
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create profile_views table to track when companies view officer profiles
CREATE TABLE public.profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID REFERENCES public.officer_profiles(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.company_profiles(id) ON DELETE CASCADE NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  viewer_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies can view their own profile views"
  ON public.profile_views
  FOR SELECT
  USING (viewer_user_id = auth.uid());

CREATE POLICY "Companies can insert profile views"
  ON public.profile_views
  FOR INSERT
  WITH CHECK (viewer_user_id = auth.uid());

CREATE POLICY "Officers can view their profile views"
  ON public.profile_views
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM officer_profiles WHERE id = officer_id
    )
  );

CREATE POLICY "Admins can view all profile views"
  ON public.profile_views
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Create hires table to track when companies hire officers
CREATE TABLE public.hires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID REFERENCES public.officer_profiles(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.company_profiles(id) ON DELETE CASCADE NOT NULL,
  hired_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hire_date DATE NOT NULL,
  position_title TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.hires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies can manage their own hires"
  ON public.hires
  FOR ALL
  USING (hired_by_user_id = auth.uid());

CREATE POLICY "Officers can view their hires"
  ON public.hires
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM officer_profiles WHERE id = officer_id
    )
  );

CREATE POLICY "Admins can view all hires"
  ON public.hires
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Create employment_updates table for tracking officer performance
CREATE TABLE public.employment_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id UUID REFERENCES public.hires(id) ON DELETE CASCADE NOT NULL,
  update_type TEXT NOT NULL,
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  document_url TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.employment_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies can manage their employment updates"
  ON public.employment_updates
  FOR ALL
  USING (
    hire_id IN (
      SELECT id FROM hires WHERE hired_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Officers can view their employment updates"
  ON public.employment_updates
  FOR SELECT
  USING (
    hire_id IN (
      SELECT h.id FROM hires h
      JOIN officer_profiles op ON h.officer_id = op.id
      WHERE op.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all employment updates"
  ON public.employment_updates
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updating hires updated_at
CREATE TRIGGER update_hires_updated_at
  BEFORE UPDATE ON public.hires
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Create indexes for better query performance
CREATE INDEX idx_profile_views_officer ON public.profile_views(officer_id);
CREATE INDEX idx_profile_views_company ON public.profile_views(company_id);
CREATE INDEX idx_profile_views_viewed_at ON public.profile_views(viewed_at);
CREATE INDEX idx_hires_officer ON public.hires(officer_id);
CREATE INDEX idx_hires_company ON public.hires(company_id);
CREATE INDEX idx_hires_status ON public.hires(status);
CREATE INDEX idx_employment_updates_hire ON public.employment_updates(hire_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- Insert initial admin user (you'll need to replace this with your actual user ID after first login)
-- This is a placeholder - after you sign up, you'll need to manually insert your user_id here
COMMENT ON TABLE public.user_roles IS 'After creating your first account, run: INSERT INTO public.user_roles (user_id, role) VALUES (''your-user-id-here'', ''admin'');';