-- An employment offer is only created after a company has reviewed an
-- employer-copy application. A failed evidence archive previously left one
-- such application in draft even though the company advanced it to an offer.
-- Restore the submission state for any offer-linked historical record without
-- weakening the officer/company/application relationship enforced by the hire
-- trigger.
WITH recovered_applications AS (
  UPDATE public.guard_hiring_applications AS application
  SET status = 'submitted',
      submitted_at = COALESCE(application.submitted_at, offer.sent_at, offer.created_at),
      updated_at = now()
  FROM public.employment_offers AS offer
  WHERE offer.hiring_application_id = application.id
    AND offer.status IN ('sent', 'viewed', 'accepted')
    AND application.application_type = 'employer_copy'
    AND application.status = 'draft'
  RETURNING application.source_application_id, application.submitted_at
)
UPDATE public.guard_hiring_applications AS master
SET status = 'submitted',
    submitted_at = COALESCE(master.submitted_at, recovered.submitted_at),
    updated_at = now()
FROM recovered_applications AS recovered
WHERE master.id = recovered.source_application_id
  AND master.application_type = 'master'
  AND master.status = 'draft';
