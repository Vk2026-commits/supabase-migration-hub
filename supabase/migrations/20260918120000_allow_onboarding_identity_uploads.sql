-- Identity evidence is stored in the same private, audited onboarding archive as
-- signed forms. Company access remains limited by the existing compliance-file
-- RLS policies and every upload receives an immutable compliance record.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]
WHERE id = 'onboarding-documents';
