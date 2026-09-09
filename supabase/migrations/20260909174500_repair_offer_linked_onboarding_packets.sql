-- Repair onboarding drafts created before the employment-offer gate was added,
-- then expose one idempotent entry point that always returns the packet owned by
-- the officer's accepted offer.
UPDATE public.officer_onboarding_packets packet
SET
  hire_id = (
    SELECT h.id
    FROM public.hires h
    WHERE h.officer_id = packet.officer_id
      AND h.hiring_application_id = packet.hiring_application_id
      AND h.status = 'active'
      AND h.offer_prepared_at IS NOT NULL
    ORDER BY h.offer_prepared_at DESC, h.created_at DESC
    LIMIT 1
  ),
  updated_at = now()
WHERE packet.hire_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.hires h
    WHERE h.officer_id = packet.officer_id
      AND h.hiring_application_id = packet.hiring_application_id
      AND h.status = 'active'
      AND h.offer_prepared_at IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.ensure_officer_onboarding_packet(_hire_id uuid)
RETURNS public.officer_onboarding_packets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_hire public.hires%ROWTYPE;
  matched_company_name text;
  packet public.officer_onboarding_packets%ROWTYPE;
BEGIN
  SELECT h.*
  INTO matched_hire
  FROM public.hires h
  JOIN public.officer_profiles officer ON officer.id = h.officer_id
  WHERE h.id = _hire_id
    AND officer.user_id = auth.uid()
    AND h.status = 'active'
    AND h.offer_prepared_at IS NOT NULL
    AND h.hiring_application_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An accepted company offer is required before employee onboarding';
  END IF;

  SELECT company.company_name
  INTO matched_company_name
  FROM public.company_profiles company
  WHERE company.id = matched_hire.company_id;

  INSERT INTO public.officer_onboarding_packets (
    user_id,
    officer_id,
    hire_id,
    hiring_application_id,
    company_name,
    status,
    current_step,
    form_data
  )
  VALUES (
    auth.uid(),
    matched_hire.officer_id,
    matched_hire.id,
    matched_hire.hiring_application_id,
    COALESCE(matched_company_name, 'Hiring company'),
    'draft',
    0,
    '{}'::jsonb
  )
  ON CONFLICT (officer_id, hiring_application_id) DO UPDATE
  SET
    hire_id = EXCLUDED.hire_id,
    company_name = EXCLUDED.company_name,
    updated_at = now()
  WHERE officer_onboarding_packets.hire_id IS NULL
     OR officer_onboarding_packets.hire_id = EXCLUDED.hire_id
  RETURNING * INTO packet;

  IF packet.id IS NULL THEN
    RAISE EXCEPTION 'This onboarding application is already linked to another hire';
  END IF;

  RETURN packet;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_officer_onboarding_packet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_officer_onboarding_packet(uuid) TO authenticated;

COMMENT ON FUNCTION public.ensure_officer_onboarding_packet(uuid) IS
  'Returns or repairs the signed-in officer onboarding packet for an accepted employment offer.';
