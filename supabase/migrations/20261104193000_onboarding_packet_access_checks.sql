-- Avoid expanding nested hire/application/profile RLS for each draft save.
CREATE OR REPLACE FUNCTION public.officer_can_manage_onboarding_packet(_user_id uuid, _officer_id uuid, _hire_id uuid, _application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.hires h JOIN public.officer_profiles o ON o.id = h.officer_id
    WHERE h.id = _hire_id AND h.officer_id = _officer_id AND o.user_id = auth.uid()
      AND h.hiring_application_id = _application_id AND h.status = 'active'
      AND h.offer_prepared_at IS NOT NULL AND NOT h.test_archived
  );
$$;
REVOKE ALL ON FUNCTION public.officer_can_manage_onboarding_packet(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.officer_can_manage_onboarding_packet(uuid,uuid,uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.company_can_read_onboarding_packet(_hire_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.hires h WHERE h.id = _hire_id
    AND NOT h.test_archived AND public.company_team_has_access(h.company_id));
$$;
REVOKE ALL ON FUNCTION public.company_can_read_onboarding_packet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_can_read_onboarding_packet(uuid) TO authenticated;
DROP POLICY IF EXISTS "Officers manage offer-linked onboarding packets" ON public.officer_onboarding_packets;
CREATE POLICY "Officers manage offer-linked onboarding packets" ON public.officer_onboarding_packets FOR ALL TO authenticated
USING (public.officer_can_manage_onboarding_packet(user_id,officer_id,hire_id,hiring_application_id))
WITH CHECK (public.officer_can_manage_onboarding_packet(user_id,officer_id,hire_id,hiring_application_id));
DROP POLICY IF EXISTS "Companies view submitted onboarding for their applicants" ON public.officer_onboarding_packets;
DROP POLICY IF EXISTS "Company team views submitted onboarding packets" ON public.officer_onboarding_packets;
CREATE POLICY "Company team views submitted onboarding packets" ON public.officer_onboarding_packets FOR SELECT TO authenticated
USING ((status = 'submitted' OR i9_submitted_at IS NOT NULL OR w4_submitted_at IS NOT NULL)
  AND public.company_can_read_onboarding_packet(hire_id));
