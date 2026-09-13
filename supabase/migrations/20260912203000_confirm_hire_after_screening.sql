-- Completing onboarding is not the final hiring decision. Keep the existing hire
-- record as the access bridge for onboarding, then require a separate employer
-- confirmation before the officer is treated as hired.
ALTER TABLE public.hires
  ADD COLUMN IF NOT EXISTS employment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS employment_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hires.employment_confirmed_at IS
  'Set only when an authorized company user approves the officer after onboarding and screening.';

-- Preserve truly legacy hires that predate the formal employment-offer flow.
UPDATE public.hires
SET employment_confirmed_at = COALESCE(created_at, now()),
    employment_confirmed_by = hired_by_user_id
WHERE employment_confirmed_at IS NULL
  AND offer_id IS NULL;

UPDATE public.hires AS hire
SET employment_confirmed_at = COALESCE(offer.accepted_at, hire.created_at, now()),
    employment_confirmed_by = hire.hired_by_user_id
FROM public.employment_offers AS offer
WHERE offer.hire_id = hire.id
  AND offer.status = 'legacy_accepted'
  AND hire.employment_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hires_company_confirmed
  ON public.hires(company_id, employment_confirmed_at DESC)
  WHERE employment_confirmed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_hire_confirmation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  packet_status text;
BEGIN
  IF OLD.employment_confirmed_at IS NOT NULL
    AND NEW.employment_confirmed_at IS DISTINCT FROM OLD.employment_confirmed_at THEN
    RAISE EXCEPTION 'A confirmed hire cannot be unconfirmed or redated';
  END IF;

  IF OLD.employment_confirmed_at IS NULL AND NEW.employment_confirmed_at IS NOT NULL THEN
    IF NOT public.company_team_has_access(
      OLD.company_id,
      ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
    ) AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'You are not authorized to confirm this hire';
    END IF;

    SELECT packet.status INTO packet_status
    FROM public.officer_onboarding_packets AS packet
    WHERE packet.hire_id = OLD.id
    ORDER BY packet.updated_at DESC
    LIMIT 1;

    IF packet_status IS DISTINCT FROM 'submitted' THEN
      RAISE EXCEPTION 'The officer must submit onboarding before the hire can be confirmed';
    END IF;

    NEW.employment_confirmed_at := now();
    NEW.employment_confirmed_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_hire_confirmation_transition ON public.hires;
CREATE TRIGGER enforce_hire_confirmation_transition
BEFORE UPDATE OF employment_confirmed_at, employment_confirmed_by ON public.hires
FOR EACH ROW
EXECUTE FUNCTION public.enforce_hire_confirmation_transition();

CREATE OR REPLACE FUNCTION public.confirm_officer_hire(_hire_id uuid)
RETURNS public.hires
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hire_row public.hires;
  packet_status text;
BEGIN
  SELECT * INTO hire_row
  FROM public.hires
  WHERE id = _hire_id
  FOR UPDATE;

  IF hire_row.id IS NULL THEN
    RAISE EXCEPTION 'Hire record not found';
  END IF;

  IF NOT public.company_team_has_access(
    hire_row.company_id,
    ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
  ) AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You are not authorized to confirm this hire';
  END IF;

  IF hire_row.employment_confirmed_at IS NOT NULL THEN
    RETURN hire_row;
  END IF;

  SELECT packet.status INTO packet_status
  FROM public.officer_onboarding_packets AS packet
  WHERE packet.hire_id = hire_row.id
  ORDER BY packet.updated_at DESC
  LIMIT 1;

  IF packet_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'The officer must submit onboarding before the hire can be confirmed';
  END IF;

  UPDATE public.hires
  SET employment_confirmed_at = now(),
      employment_confirmed_by = auth.uid(),
      updated_at = now()
  WHERE id = hire_row.id
  RETURNING * INTO hire_row;

  RETURN hire_row;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_officer_hire(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_officer_hire(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.company_hired_officer(_company_user_id uuid, _officer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hires AS hire
    JOIN public.company_profiles AS company ON company.id = hire.company_id
    WHERE hire.officer_id = _officer_id
      AND hire.employment_confirmed_at IS NOT NULL
      AND (
        company.user_id = _company_user_id
        OR EXISTS (
          SELECT 1
          FROM public.company_members AS member
          WHERE member.company_id = company.id
            AND member.user_id = _company_user_id
            AND member.status IN ('active', 'invited')
        )
      )
  );
$$;
