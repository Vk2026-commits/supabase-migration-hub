-- Employee onboarding belongs to one company offer and one immutable employer
-- application copy. Officers cannot create or change a packet until the
-- company has prepared that offer.
ALTER TABLE public.hires
  ADD COLUMN IF NOT EXISTS hiring_application_id uuid
    REFERENCES public.guard_hiring_applications(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_hires_hiring_application
  ON public.hires(hiring_application_id)
  WHERE hiring_application_id IS NOT NULL;

-- Backfill older offers when their company/job application relationship is
-- unambiguous. New offers always write this link directly.
UPDATE public.hires h
SET hiring_application_id = (
  SELECT gha.id
  FROM public.guard_hiring_applications gha
  JOIN public.job_applications ja ON ja.id = gha.job_application_id
  JOIN public.job_postings jp ON jp.id = ja.job_posting_id
  WHERE gha.officer_id = h.officer_id
    AND gha.application_type = 'employer_copy'
    AND gha.status = 'submitted'
    AND jp.company_id = h.company_id
  ORDER BY gha.submitted_at DESC NULLS LAST, gha.created_at DESC
  LIMIT 1
)
WHERE h.hiring_application_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.guard_hiring_applications gha
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    WHERE gha.officer_id = h.officer_id
      AND gha.application_type = 'employer_copy'
      AND gha.status = 'submitted'
      AND jp.company_id = h.company_id
  );

CREATE OR REPLACE FUNCTION public.validate_hire_application_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.offer_prepared_at IS NOT NULL AND NEW.hiring_application_id IS NULL THEN
    RAISE EXCEPTION 'A submitted company application is required before an offer can be sent';
  END IF;

  IF NEW.hiring_application_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.guard_hiring_applications gha
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    WHERE gha.id = NEW.hiring_application_id
      AND gha.officer_id = NEW.officer_id
      AND gha.application_type = 'employer_copy'
      AND gha.status = 'submitted'
      AND jp.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'The offer must be linked to this company''s submitted application';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_hire_application_offer ON public.hires;
CREATE TRIGGER validate_hire_application_offer
BEFORE INSERT OR UPDATE OF hiring_application_id, offer_prepared_at, officer_id, company_id
ON public.hires
FOR EACH ROW EXECUTE FUNCTION public.validate_hire_application_offer();

ALTER TABLE public.officer_onboarding_packets
  ADD COLUMN IF NOT EXISTS hire_id uuid
    REFERENCES public.hires(id) ON DELETE RESTRICT;

UPDATE public.officer_onboarding_packets packet
SET hire_id = (
  SELECT h.id
  FROM public.hires h
  WHERE h.officer_id = packet.officer_id
    AND h.hiring_application_id = packet.hiring_application_id
    AND h.status = 'active'
    AND h.offer_prepared_at IS NOT NULL
  ORDER BY h.offer_prepared_at DESC, h.created_at DESC
  LIMIT 1
)
WHERE packet.hire_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.hires h
    WHERE h.officer_id = packet.officer_id
      AND h.hiring_application_id = packet.hiring_application_id
      AND h.status = 'active'
      AND h.offer_prepared_at IS NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_packet_hire
  ON public.officer_onboarding_packets(hire_id)
  WHERE hire_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_onboarding_offer_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hire_id IS NULL OR NEW.hiring_application_id IS NULL THEN
    RAISE EXCEPTION 'A prepared company offer is required before employee onboarding';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.hires h
    JOIN public.guard_hiring_applications gha
      ON gha.id = h.hiring_application_id
    JOIN public.job_applications ja ON ja.id = gha.job_application_id
    JOIN public.job_postings jp ON jp.id = ja.job_posting_id
    WHERE h.id = NEW.hire_id
      AND h.officer_id = NEW.officer_id
      AND h.hiring_application_id = NEW.hiring_application_id
      AND h.status = 'active'
      AND h.offer_prepared_at IS NOT NULL
      AND gha.officer_id = NEW.officer_id
      AND gha.application_type = 'employer_copy'
      AND gha.status = 'submitted'
      AND jp.company_id = h.company_id
  ) THEN
    RAISE EXCEPTION 'This onboarding packet is not linked to an active prepared offer';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_onboarding_offer_link
  ON public.officer_onboarding_packets;
CREATE TRIGGER validate_onboarding_offer_link
BEFORE INSERT OR UPDATE OF hire_id, hiring_application_id, officer_id
ON public.officer_onboarding_packets
FOR EACH ROW EXECUTE FUNCTION public.validate_onboarding_offer_link();

DROP POLICY IF EXISTS "Officers manage their own onboarding packet"
  ON public.officer_onboarding_packets;
CREATE POLICY "Officers manage offer-linked onboarding packets"
ON public.officer_onboarding_packets FOR ALL
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.hires h
    WHERE h.id = officer_onboarding_packets.hire_id
      AND h.officer_id = officer_onboarding_packets.officer_id
      AND h.hiring_application_id = officer_onboarding_packets.hiring_application_id
      AND h.status = 'active'
      AND h.offer_prepared_at IS NOT NULL
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND officer_id IN (
    SELECT id FROM public.officer_profiles WHERE user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.hires h
    WHERE h.id = officer_onboarding_packets.hire_id
      AND h.officer_id = officer_onboarding_packets.officer_id
      AND h.hiring_application_id = officer_onboarding_packets.hiring_application_id
      AND h.status = 'active'
      AND h.offer_prepared_at IS NOT NULL
  )
);

COMMENT ON COLUMN public.hires.hiring_application_id IS
  'Exact employer-copy application for which the company prepared this offer.';
COMMENT ON COLUMN public.officer_onboarding_packets.hire_id IS
  'Prepared company offer that unlocks and owns this onboarding packet.';
