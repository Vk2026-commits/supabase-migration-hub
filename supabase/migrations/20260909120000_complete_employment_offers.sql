-- Versioned employment offers are separate from hires: sending an offer is
-- not the same event as employing an officer.
CREATE TABLE IF NOT EXISTS public.employment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE RESTRICT,
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id) ON DELETE RESTRICT,
  hiring_application_id uuid REFERENCES public.guard_hiring_applications(id) ON DELETE RESTRICT,
  job_application_id uuid REFERENCES public.job_applications(id) ON DELETE SET NULL,
  job_posting_id uuid REFERENCES public.job_postings(id) ON DELETE SET NULL,
  hire_id uuid UNIQUE REFERENCES public.hires(id) ON DELETE RESTRICT,
  supersedes_offer_id uuid REFERENCES public.employment_offers(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','accepted','declined','expired','withdrawn','revised','legacy_accepted')),
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  employer_signature_name text NOT NULL,
  employer_signature_title text NOT NULL,
  employer_signed_at timestamptz NOT NULL DEFAULT now(),
  offer_document_path text,
  offer_document_sha256 text CHECK (offer_document_sha256 IS NULL OR length(offer_document_sha256) = 64),
  accepted_document_path text,
  accepted_document_sha256 text CHECK (accepted_document_sha256 IS NULL OR length(accepted_document_sha256) = 64),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  expired_at timestamptz,
  withdrawn_at timestamptz,
  officer_printed_name text,
  decline_reason text,
  legacy_acceptance_unverified boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, officer_id, hiring_application_id, version),
  CHECK (status = 'legacy_accepted' OR hiring_application_id IS NOT NULL)
);

ALTER TABLE public.hires ADD COLUMN IF NOT EXISTS offer_id uuid UNIQUE REFERENCES public.employment_offers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_employment_offers_officer_status ON public.employment_offers(officer_id, status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_employment_offers_company_status ON public.employment_offers(company_id, status, sent_at DESC);

ALTER TABLE public.employment_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies view their employment offers"
ON public.employment_offers FOR SELECT
USING (company_id IN (SELECT id FROM public.company_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Officers view offers sent to them"
ON public.employment_offers FOR SELECT
USING (officer_id IN (SELECT id FROM public.officer_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins view employment offers"
ON public.employment_offers FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO storage.buckets (id, name, public)
VALUES ('employment-offers', 'employment-offers', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Offer documents are written only by the authenticated Edge Function using
-- server credentials. Reads are delivered through short-lived signed URLs.

CREATE OR REPLACE FUNCTION public.mark_employment_offer_viewed(_offer_id uuid)
RETURNS public.employment_offers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result public.employment_offers;
BEGIN
  UPDATE public.employment_offers offer
  SET status = CASE WHEN offer.status = 'sent' THEN 'viewed' ELSE offer.status END,
      viewed_at = COALESCE(offer.viewed_at, now()), updated_at = now()
  WHERE offer.id = _offer_id
    AND offer.status IN ('sent','viewed')
    AND offer.officer_id IN (SELECT id FROM public.officer_profiles WHERE user_id = auth.uid())
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'Offer is not available'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_employment_offer_acceptance(
  _offer_id uuid,
  _accepted_document_path text,
  _accepted_document_sha256 text,
  _officer_printed_name text,
  _acting_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE offer_row public.employment_offers; new_hire_id uuid;
BEGIN
  SELECT * INTO offer_row FROM public.employment_offers
  WHERE id = _offer_id FOR UPDATE;
  IF offer_row.id IS NULL OR offer_row.officer_id NOT IN (SELECT id FROM public.officer_profiles WHERE user_id = _acting_user_id) THEN
    RAISE EXCEPTION 'Offer is not available';
  END IF;
  IF offer_row.status = 'accepted' THEN RETURN offer_row.hire_id; END IF;
  IF offer_row.status NOT IN ('sent','viewed') OR offer_row.viewed_at IS NULL THEN RAISE EXCEPTION 'View the offer before accepting it'; END IF;
  IF (offer_row.terms->>'acceptanceDeadline')::date < current_date THEN
    UPDATE public.employment_offers SET status='expired', expired_at=now(), updated_at=now() WHERE id=_offer_id;
    RAISE EXCEPTION 'This offer has expired';
  END IF;
  IF length(COALESCE(_accepted_document_sha256,'')) <> 64 OR COALESCE(trim(_officer_printed_name),'') = '' THEN
    RAISE EXCEPTION 'Signed offer evidence is incomplete';
  END IF;

  INSERT INTO public.hires (officer_id, company_id, hired_by_user_id, hire_date, hiring_application_id, position_title, status, offer_prepared_at, offer_terms, offer_id)
  VALUES (offer_row.officer_id, offer_row.company_id, offer_row.created_by,
    (offer_row.terms->>'startDate')::date, offer_row.hiring_application_id,
    offer_row.terms->>'positionTitle', 'active', offer_row.sent_at, offer_row.terms, offer_row.id)
  RETURNING id INTO new_hire_id;

  UPDATE public.employment_offers SET status='accepted', accepted_at=now(), officer_printed_name=trim(_officer_printed_name),
    accepted_document_path=_accepted_document_path, accepted_document_sha256=_accepted_document_sha256,
    hire_id=new_hire_id, updated_at=now() WHERE id=_offer_id;
  UPDATE public.job_applications SET status='accepted' WHERE id=offer_row.job_application_id;
  RETURN new_hire_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_employment_offer(_offer_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE offer_row public.employment_offers;
BEGIN
  SELECT * INTO offer_row FROM public.employment_offers WHERE id=_offer_id FOR UPDATE;
  IF offer_row.id IS NULL OR offer_row.officer_id NOT IN (SELECT id FROM public.officer_profiles WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Offer is not available'; END IF;
  IF offer_row.status NOT IN ('sent','viewed') THEN RAISE EXCEPTION 'Offer can no longer be declined'; END IF;
  UPDATE public.employment_offers SET status='declined', declined_at=now(), decline_reason=NULLIF(trim(_reason),''), updated_at=now() WHERE id=_offer_id;
  UPDATE public.job_applications SET status='declined' WHERE id=offer_row.job_application_id;
END;
$$;

-- Preserve access for people already treated as active employees. These rows
-- intentionally state that historical acceptance evidence was not captured.
INSERT INTO public.employment_offers (
  company_id, officer_id, hiring_application_id, hire_id, version, status, terms,
  employer_signature_name, employer_signature_title, employer_signed_at,
  prepared_at, sent_at, accepted_at, legacy_acceptance_unverified, created_by
)
SELECT h.company_id, h.officer_id, h.hiring_application_id, h.id, 1, 'legacy_accepted', h.offer_terms,
  COALESCE(NULLIF(h.offer_terms->>'employerSignatureName',''), NULLIF(h.offer_terms->>'representativeName',''), 'Company representative'),
  COALESCE(NULLIF(h.offer_terms->>'representativeTitle',''), 'Authorized Hiring Representative'),
  COALESCE(h.offer_prepared_at,h.created_at), COALESCE(h.offer_prepared_at,h.created_at),
  COALESCE(h.offer_prepared_at,h.created_at), COALESCE(h.offer_prepared_at,h.created_at), true, h.hired_by_user_id
FROM public.hires h
WHERE h.status='active' AND h.offer_id IS NULL
ON CONFLICT DO NOTHING;

UPDATE public.hires h SET offer_id=o.id
FROM public.employment_offers o
WHERE o.hire_id=h.id AND h.offer_id IS NULL;

GRANT EXECUTE ON FUNCTION public.mark_employment_offer_viewed(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_employment_offer_acceptance(uuid,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_employment_offer_acceptance(uuid,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_employment_offer(uuid,text) TO authenticated;
GRANT SELECT ON public.employment_offers TO authenticated;
