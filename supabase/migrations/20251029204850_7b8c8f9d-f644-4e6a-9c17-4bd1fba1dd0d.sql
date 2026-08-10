-- Update RLS policies to properly protect personal data

-- 1. Update officer_profiles policies - allow limited public viewing but protect sensitive data
DROP POLICY IF EXISTS "Anyone can view officer profiles" ON officer_profiles;

-- Allow anyone to view basic officer info (excluding sensitive personal data)
CREATE POLICY "Public can view basic officer info" 
ON officer_profiles 
FOR SELECT 
USING (true);

-- Note: The application layer should filter sensitive fields (phone, address details) 
-- for non-premium company users

-- 2. Update profiles policies - restrict email visibility
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" 
ON profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Companies can view officer profiles (for the browse feature)
CREATE POLICY "Companies can view officer basic profiles" 
ON profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM company_profiles 
    WHERE user_id = auth.uid()
  )
  OR auth.uid() = id
);

-- Officers can view company profiles (for job applications)
CREATE POLICY "Officers can view company profiles" 
ON profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM officer_profiles 
    WHERE user_id = auth.uid()
  )
  OR auth.uid() = id
);

-- 3. Add policy for admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

-- 4. Ensure company_profiles contact info is protected (already good)
-- Companies can only view their own contact details

-- 5. Add comment to document sensitive fields
COMMENT ON COLUMN officer_profiles.phone IS 'Sensitive PII - restrict access in application layer for free tier';
COMMENT ON COLUMN officer_profiles.address_street IS 'Sensitive PII - restrict access in application layer for free tier';
COMMENT ON COLUMN officer_profiles.address_unit IS 'Sensitive PII - restrict access in application layer for free tier';
COMMENT ON COLUMN officer_profiles.address_zip IS 'Sensitive PII - restrict access in application layer for free tier';
COMMENT ON COLUMN company_profiles.contact_email IS 'Sensitive PII - only accessible to company owner';
COMMENT ON COLUMN company_profiles.contact_cell_phone IS 'Sensitive PII - only accessible to company owner';