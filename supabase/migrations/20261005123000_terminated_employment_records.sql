-- Keep an auditable employment-end record separate from pre-hire decisions.
ALTER TABLE public.hires
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS termination_reason text;

CREATE INDEX IF NOT EXISTS idx_hires_company_terminated
  ON public.hires(company_id, terminated_at DESC)
  WHERE status = 'terminated';

CREATE OR REPLACE FUNCTION public.terminate_hired_officer(_hire_id uuid, _reason text)
RETURNS public.hires
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.hires%ROWTYPE;
BEGIN
  IF nullif(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'A termination reason is required';
  END IF;

  SELECT * INTO result
  FROM public.hires
  WHERE id = _hire_id
  FOR UPDATE;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Employment record not found';
  END IF;

  IF NOT public.company_team_has_access(
    result.company_id,
    ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
  ) AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You are not authorized to terminate this employment record';
  END IF;

  IF result.status <> 'active'
     OR result.employment_confirmed_at IS NULL
     OR result.onboarding_reviewed_at IS NULL THEN
    RAISE EXCEPTION 'Only a fully hired, active officer can be terminated';
  END IF;

  UPDATE public.hires
  SET status = 'terminated',
      terminated_at = now(),
      terminated_by = auth.uid(),
      termination_reason = btrim(_reason),
      updated_at = now()
  WHERE id = result.id
  RETURNING * INTO result;

  INSERT INTO public.employment_updates (hire_id, update_type, notes, created_by_user_id)
  VALUES (result.id, 'employment_terminated', btrim(_reason), auth.uid());

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.terminate_hired_officer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminate_hired_officer(uuid, text) TO authenticated;

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
      AND hire.status = 'active'
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

REVOKE ALL ON FUNCTION public.company_hired_officer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_hired_officer(uuid, uuid) TO authenticated;

COMMENT ON COLUMN public.hires.terminated_at IS
  'Timestamp when an authorized company representative ended a fully hired officer employment record.';
COMMENT ON COLUMN public.hires.termination_reason IS
  'Required documented reason supplied by the authorized company representative at termination.';
COMMENT ON FUNCTION public.terminate_hired_officer(uuid, text) IS
  'Ends a fully hired active employment record while retaining its offer, onboarding, screening, and audit history.';
