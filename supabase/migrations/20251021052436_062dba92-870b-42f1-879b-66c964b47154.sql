-- Update certifications table to support Texas security officer license structure

-- Add new columns for license levels and training types
ALTER TABLE certifications 
ADD COLUMN IF NOT EXISTS license_level TEXT,
ADD COLUMN IF NOT EXISTS certification_type TEXT DEFAULT 'training',
ADD COLUMN IF NOT EXISTS certification_number TEXT;

-- Create index for better querying
CREATE INDEX IF NOT EXISTS idx_certifications_type ON certifications(certification_type);
CREATE INDEX IF NOT EXISTS idx_certifications_license_level ON certifications(license_level);

COMMENT ON COLUMN certifications.license_level IS 'Texas security officer license level: Level II (Non-Commissioned), Level III (Commissioned), Level IV (Personal Protection Officer), Private Investigator';
COMMENT ON COLUMN certifications.certification_type IS 'Type: license or training';
COMMENT ON COLUMN certifications.certification_number IS 'License or certification number';