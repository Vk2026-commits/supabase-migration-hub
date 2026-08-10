-- Add username to profiles table
ALTER TABLE profiles ADD COLUMN username text UNIQUE;
CREATE INDEX idx_profiles_username ON profiles(username);

-- Add additional fields to officer_profiles to match the screenshot
ALTER TABLE officer_profiles ADD COLUMN address_street text;
ALTER TABLE officer_profiles ADD COLUMN address_unit text;
ALTER TABLE officer_profiles ADD COLUMN address_city text;
ALTER TABLE officer_profiles ADD COLUMN address_state text;
ALTER TABLE officer_profiles ADD COLUMN address_zip text;
ALTER TABLE officer_profiles ADD COLUMN address_country text DEFAULT 'United States of America';
ALTER TABLE officer_profiles ADD COLUMN main_region text;
ALTER TABLE officer_profiles ADD COLUMN officer_number text;
ALTER TABLE officer_profiles ADD COLUMN avatar_url text;

-- Create assigned_sites table for officer site assignments
CREATE TABLE assigned_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid REFERENCES officer_profiles(id) ON DELETE CASCADE NOT NULL,
  site_name text NOT NULL,
  start_date date,
  effective_rate_date date,
  rate numeric,
  status text DEFAULT 'Active',
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE assigned_sites ENABLE ROW LEVEL SECURITY;

-- RLS policies for assigned_sites
CREATE POLICY "Officers can view own assigned sites"
  ON assigned_sites FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM officer_profiles WHERE id = assigned_sites.officer_id
    )
  );

CREATE POLICY "Officers can manage own assigned sites"
  ON assigned_sites FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM officer_profiles WHERE id = assigned_sites.officer_id
    )
  );

CREATE POLICY "Companies can view assigned sites"
  ON assigned_sites FOR SELECT
  USING (true);

-- Trigger for updating assigned_sites timestamps
CREATE TRIGGER update_assigned_sites_updated_at
  BEFORE UPDATE ON assigned_sites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();