-- Profile completion is enforced in the company dashboard and server-side
-- hiring actions. It must not hide applications or historical hiring records.
DROP POLICY IF EXISTS "Complete company profile required for hiring job postings"
  ON public.job_postings;

DROP POLICY IF EXISTS "Complete company profile required for hiring applications"
  ON public.job_applications;

DROP POLICY IF EXISTS "Complete company profile required for employer application copies"
  ON public.guard_hiring_applications;

DROP POLICY IF EXISTS "Complete company profile required for employment offers"
  ON public.employment_offers;

DROP POLICY IF EXISTS "Complete company profile required for hires"
  ON public.hires;

DROP POLICY IF EXISTS "Complete company profile required for officer interests"
  ON public.officer_interests;
