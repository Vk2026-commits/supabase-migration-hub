-- Employer tax details are separate from publicly browsable company profiles.
CREATE TABLE IF NOT EXISTS public.company_employer_tax_details (
  company_id uuid PRIMARY KEY REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  ein text NOT NULL CHECK (ein ~ '^[0-9]{2}-[0-9]{7}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_employer_tax_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_employer_tax_details FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.onboarding_employer_tax_details(_hire_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('ein',t.ein,'name',c.company_name,'address',
    concat_ws(', ',nullif(c.company_address,''),nullif(c.company_address_unit,''),
      nullif(c.company_city,''),nullif(c.company_state,''),nullif(c.company_zip,'')))
  FROM public.hires h JOIN public.company_profiles c ON c.id=h.company_id
  LEFT JOIN public.company_employer_tax_details t ON t.company_id=c.id
  WHERE h.id=_hire_id AND h.status='active' AND NOT coalesce(h.test_archived,false)
    AND (EXISTS(SELECT 1 FROM public.officer_profiles o WHERE o.id=h.officer_id AND o.user_id=auth.uid())
      OR public.company_team_has_access(c.id,ARRAY['owner','admin','hiring_manager']::public.company_member_role[]))
$$;
REVOKE ALL ON FUNCTION public.onboarding_employer_tax_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.onboarding_employer_tax_details(uuid) TO authenticated;
