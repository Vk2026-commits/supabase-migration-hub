-- Add company_number to company_profiles if it doesn't exist
ALTER TABLE company_profiles 
ADD COLUMN IF NOT EXISTS company_number text UNIQUE;

-- Create sequences starting at 100
CREATE SEQUENCE IF NOT EXISTS company_number_seq START WITH 100;
CREATE SEQUENCE IF NOT EXISTS officer_number_seq START WITH 100;

-- Function to auto-assign company number
CREATE OR REPLACE FUNCTION assign_company_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_number IS NULL THEN
    NEW.company_number := nextval('company_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

-- Function to auto-assign officer number
CREATE OR REPLACE FUNCTION assign_officer_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.officer_number IS NULL THEN
    NEW.officer_number := nextval('officer_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for company_profiles
DROP TRIGGER IF EXISTS set_company_number ON company_profiles;
CREATE TRIGGER set_company_number
  BEFORE INSERT ON company_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_company_number();

-- Create trigger for officer_profiles
DROP TRIGGER IF EXISTS set_officer_number ON officer_profiles;
CREATE TRIGGER set_officer_number
  BEFORE INSERT ON officer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_officer_number();

-- Assign Kairos Security as company #100
UPDATE company_profiles
SET company_number = '100'
WHERE company_name = 'Kairos Security'
AND company_number IS NULL;

-- Update sequence to continue from where we left off
SELECT setval('company_number_seq', 
  COALESCE((SELECT MAX(company_number::integer) FROM company_profiles WHERE company_number ~ '^[0-9]+$'), 99) + 1,
  false);

SELECT setval('officer_number_seq', 
  COALESCE((SELECT MAX(officer_number::integer) FROM officer_profiles WHERE officer_number ~ '^[0-9]+$'), 99) + 1,
  false);