-- Reusable client worksite records let a company prepare an offer without
-- retyping assignment details. Offers retain a snapshot of these values.
CREATE TABLE public.company_client_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
  site_name text NOT NULL CHECK (length(trim(site_name)) > 0),
  client_name text NOT NULL CHECK (length(trim(client_name)) > 0),
  address_street text NOT NULL CHECK (length(trim(address_street)) > 0),
  address_unit text,
  address_city text NOT NULL CHECK (length(trim(address_city)) > 0),
  address_state text NOT NULL CHECK (length(trim(address_state)) > 0),
  address_zip text NOT NULL CHECK (length(trim(address_zip)) > 0),
  supervisor_name text NOT NULL CHECK (length(trim(supervisor_name)) > 0),
  site_contact_name text,
  site_contact_phone text,
  shift_days text[] NOT NULL DEFAULT '{}',
  shift_start_time time NOT NULL,
  shift_end_time time NOT NULL,
  expected_weekly_hours numeric(5,2) NOT NULL CHECK (expected_weekly_hours > 0 AND expected_weekly_hours <= 168),
  schedule_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(shift_days) > 0)
);

CREATE INDEX company_client_sites_company_active_idx
  ON public.company_client_sites(company_id, is_active, site_name);

ALTER TABLE public.company_client_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company team can view client sites"
  ON public.company_client_sites FOR SELECT TO authenticated
  USING (public.company_team_has_access(company_id));

CREATE POLICY "Company hiring team can create client sites"
  ON public.company_client_sites FOR INSERT TO authenticated
  WITH CHECK (
    public.company_team_has_access(
      company_id,
      ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
    )
  );

CREATE POLICY "Company hiring team can update client sites"
  ON public.company_client_sites FOR UPDATE TO authenticated
  USING (
    public.company_team_has_access(
      company_id,
      ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
    )
  )
  WITH CHECK (
    public.company_team_has_access(
      company_id,
      ARRAY['owner', 'admin', 'hiring_manager']::public.company_member_role[]
    )
  );

CREATE POLICY "Company administrators can delete client sites"
  ON public.company_client_sites FOR DELETE TO authenticated
  USING (
    public.company_team_has_access(
      company_id,
      ARRAY['owner', 'admin']::public.company_member_role[]
    )
  );

CREATE TRIGGER update_company_client_sites_updated_at
  BEFORE UPDATE ON public.company_client_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.company_client_sites IS
  'Reusable company client worksites and standard schedules used to prefill employment offers.';
