ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS rating_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS public.company_assigned_equipment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.company_profiles(id),
 officer_id uuid NOT NULL REFERENCES public.officer_profiles(id),
 item text NOT NULL CHECK (length(trim(item)) > 0),
 identifier text NOT NULL DEFAULT '',
 quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
 issued_on date NOT NULL DEFAULT current_date,
 returned_on date,
 notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (returned_on IS NULL OR returned_on >= issued_on)
);
ALTER TABLE public.company_assigned_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_equipment_read ON public.company_assigned_equipment FOR SELECT TO authenticated USING (public.company_team_has_access(company_id));
CREATE POLICY company_equipment_insert ON public.company_assigned_equipment FOR INSERT TO authenticated WITH CHECK (public.company_team_has_access(company_id, ARRAY['owner','admin','hiring_manager']::public.company_member_role[]) AND EXISTS (SELECT 1 FROM public.hires WHERE company_id = company_assigned_equipment.company_id AND officer_id = company_assigned_equipment.officer_id));
CREATE POLICY company_equipment_update ON public.company_assigned_equipment FOR UPDATE TO authenticated USING (public.company_team_has_access(company_id, ARRAY['owner','admin','hiring_manager']::public.company_member_role[])) WITH CHECK (public.company_team_has_access(company_id, ARRAY['owner','admin','hiring_manager']::public.company_member_role[]));
GRANT SELECT, INSERT, UPDATE ON public.company_assigned_equipment TO authenticated;
