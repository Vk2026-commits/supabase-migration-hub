-- Company review, targeted correction requests, and office-completed versions.
ALTER TABLE public.officer_onboarding_packets
  DROP CONSTRAINT IF EXISTS officer_onboarding_packets_status_check;
ALTER TABLE public.officer_onboarding_packets
  ADD CONSTRAINT officer_onboarding_packets_status_check
  CHECK (status IN ('draft', 'submitted', 'correction_requested'));

CREATE TABLE IF NOT EXISTS public.onboarding_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.officer_onboarding_packets(id) ON DELETE CASCADE,
  hire_id uuid NOT NULL REFERENCES public.hires(id) ON DELETE CASCADE,
  compliance_document_id uuid REFERENCES public.officer_compliance_documents(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  document_label text NOT NULL,
  page_number integer CHECK (page_number IS NULL OR page_number > 0),
  area_label text NOT NULL,
  instructions text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'resolved', 'cancelled')),
  requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.onboarding_correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company teams manage onboarding corrections"
ON public.onboarding_correction_requests FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.hires hire
    WHERE hire.id = onboarding_correction_requests.hire_id
      AND public.company_team_has_access(hire.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.hires hire
    WHERE hire.id = onboarding_correction_requests.hire_id
      AND public.company_team_has_access(hire.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  )
);

CREATE POLICY "Officers view their onboarding corrections"
ON public.onboarding_correction_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.officer_onboarding_packets packet
    WHERE packet.id = onboarding_correction_requests.packet_id AND packet.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_onboarding_corrections_packet_status
  ON public.onboarding_correction_requests(packet_id, status, requested_at DESC);

CREATE OR REPLACE FUNCTION public.request_onboarding_correction(
  _hire_id uuid,
  _document_id uuid,
  _document_type text,
  _document_label text,
  _page_number integer,
  _area_label text,
  _instructions text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  hire_record public.hires%ROWTYPE;
  packet_record public.officer_onboarding_packets%ROWTYPE;
  request_id uuid;
  destination_step integer;
BEGIN
  IF nullif(btrim(_area_label), '') IS NULL OR nullif(btrim(_instructions), '') IS NULL THEN
    RAISE EXCEPTION 'Choose the area and explain what needs to be corrected';
  END IF;
  SELECT * INTO hire_record FROM public.hires WHERE id = _hire_id;
  IF hire_record.id IS NULL THEN RAISE EXCEPTION 'Hire record not found'; END IF;
  IF NOT public.company_team_has_access(hire_record.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'You are not authorized to review this onboarding';
  END IF;
  SELECT * INTO packet_record FROM public.officer_onboarding_packets
  WHERE hire_id = _hire_id ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  IF packet_record.id IS NULL OR packet_record.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted onboarding packet can be returned for correction';
  END IF;

  destination_step := CASE
    WHEN _document_type = 'form-i9' THEN 1
    WHEN _document_type = 'form-w4' THEN 2
    WHEN _document_type = 'direct-deposit' THEN 3
    WHEN _document_type LIKE 'policy-%' THEN 5
    ELSE 7
  END;

  INSERT INTO public.onboarding_correction_requests (
    packet_id, hire_id, compliance_document_id, document_type, document_label,
    page_number, area_label, instructions
  ) VALUES (
    packet_record.id, _hire_id, _document_id, _document_type, _document_label,
    _page_number, btrim(_area_label), btrim(_instructions)
  ) RETURNING id INTO request_id;

  UPDATE public.officer_onboarding_packets
  SET status = 'correction_requested', current_step = destination_step, updated_at = now()
  WHERE id = packet_record.id;

  INSERT INTO public.employment_updates (hire_id, update_type, notes, created_by_user_id)
  VALUES (_hire_id, 'onboarding_correction_requested',
    format('%s, page %s, %s: %s', _document_label, coalesce(_page_number::text, 'not specified'), btrim(_area_label), btrim(_instructions)), auth.uid());

  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_onboarding_corrections(_packet_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE resolved_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.officer_onboarding_packets WHERE id = _packet_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Onboarding packet not found';
  END IF;
  UPDATE public.onboarding_correction_requests
  SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  WHERE packet_id = _packet_id AND status = 'requested';
  GET DIAGNOSTICS resolved_count = ROW_COUNT;
  RETURN resolved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.request_onboarding_correction(uuid, uuid, text, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_onboarding_correction(uuid, uuid, text, text, integer, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_onboarding_corrections(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_onboarding_corrections(uuid) TO authenticated;

-- Office staff can append a new version without changing the signed original.
CREATE POLICY "Company teams append office compliance versions"
ON public.officer_compliance_documents FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.officer_onboarding_packets packet
    JOIN public.hires hire ON hire.id = packet.hire_id
    WHERE packet.id = officer_compliance_documents.packet_id
      AND public.company_team_has_access(hire.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  )
);

CREATE POLICY "Company teams upload office onboarding documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'onboarding-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.officer_onboarding_packets packet
    JOIN public.hires hire ON hire.id = packet.hire_id
    WHERE packet.id::text = (storage.foldername(name))[2]
      AND public.company_team_has_access(hire.company_id, ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[])
  )
);

CREATE OR REPLACE FUNCTION public.prevent_onboarding_acceptance_with_open_corrections()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.onboarding_reviewed_at IS NOT NULL
     AND OLD.onboarding_reviewed_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.onboarding_correction_requests correction
       WHERE correction.hire_id = NEW.id AND correction.status = 'requested'
     ) THEN
    RAISE EXCEPTION 'Resolve the requested onboarding corrections before accepting this packet';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hires_require_resolved_onboarding_corrections ON public.hires;
CREATE TRIGGER hires_require_resolved_onboarding_corrections
BEFORE UPDATE OF onboarding_reviewed_at ON public.hires
FOR EACH ROW EXECUTE FUNCTION public.prevent_onboarding_acceptance_with_open_corrections();

UPDATE public.company_profiles
SET contact_person_title = 'Executive General Manager',
    contact_person_position = 'Executive General Manager',
    updated_at = now()
WHERE lower(coalesce(contact_email, '')) = 'admin@kairossecurity.com'
   OR (lower(coalesce(company_name, '')) LIKE '%kairos security%'
       AND lower(coalesce(contact_person_name, '')) = 'erika garces');

COMMENT ON TABLE public.onboarding_correction_requests IS
  'Auditable company requests that return a specific onboarding document, page, and area to an officer.';
