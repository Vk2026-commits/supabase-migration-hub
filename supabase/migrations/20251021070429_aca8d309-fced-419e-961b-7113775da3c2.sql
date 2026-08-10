-- Add shift preference to officer profiles
ALTER TABLE officer_profiles 
ADD COLUMN shift_preference text[];