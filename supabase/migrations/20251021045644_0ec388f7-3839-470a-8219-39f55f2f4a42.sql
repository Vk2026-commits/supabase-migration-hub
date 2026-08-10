-- Create enum for subscription tiers
CREATE TYPE subscription_tier AS ENUM ('free', 'professional', 'premium');

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('officer', 'company');

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create officer profiles table
CREATE TABLE officer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  title TEXT,
  bio TEXT,
  years_experience INTEGER,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  availability_status TEXT DEFAULT 'available',
  hourly_rate DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create certifications table
CREATE TABLE certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID NOT NULL REFERENCES officer_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuing_organization TEXT,
  issue_date DATE,
  expiry_date DATE,
  credential_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create video interviews table
CREATE TABLE video_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID NOT NULL REFERENCES officer_profiles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create company profiles table
CREATE TABLE company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  company_name TEXT NOT NULL,
  subscription_tier subscription_tier DEFAULT 'free',
  industry TEXT,
  company_size TEXT,
  website_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE officer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Officer profiles policies
CREATE POLICY "Anyone can view officer profiles"
  ON officer_profiles FOR SELECT
  USING (true);

CREATE POLICY "Officers can update own profile"
  ON officer_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Officers can insert own profile"
  ON officer_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Certifications policies (tier-based access)
CREATE POLICY "Free tier can view certification names only"
  ON certifications FOR SELECT
  USING (true);

CREATE POLICY "Officers can manage own certifications"
  ON certifications FOR ALL
  USING (auth.uid() IN (
    SELECT user_id FROM officer_profiles WHERE id = officer_id
  ));

-- Video interviews policies (premium tier only)
CREATE POLICY "Officers can manage own videos"
  ON video_interviews FOR ALL
  USING (auth.uid() IN (
    SELECT user_id FROM officer_profiles WHERE id = officer_id
  ));

CREATE POLICY "Premium companies can view videos"
  ON video_interviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_profiles
      WHERE user_id = auth.uid()
      AND subscription_tier = 'premium'
    )
  );

-- Company profiles policies
CREATE POLICY "Companies can view own profile"
  ON company_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Companies can update own profile"
  ON company_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Companies can insert own profile"
  ON company_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create function to handle profile creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'officer')::user_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Update timestamps function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_officer_profiles_updated_at
  BEFORE UPDATE ON officer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_company_profiles_updated_at
  BEFORE UPDATE ON company_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();