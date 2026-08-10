-- Add hiring contact fields to company_profiles table
ALTER TABLE public.company_profiles
ADD COLUMN contact_person_name TEXT,
ADD COLUMN contact_person_title TEXT,
ADD COLUMN contact_person_position TEXT,
ADD COLUMN company_phone TEXT,
ADD COLUMN company_phone_ext TEXT,
ADD COLUMN contact_cell_phone TEXT,
ADD COLUMN contact_email TEXT;