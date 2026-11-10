ALTER TABLE public.company_employee_imports ADD COLUMN IF NOT EXISTS invitation_excluded boolean NOT NULL DEFAULT false;
GRANT SELECT(invitation_excluded) ON public.company_employee_imports TO authenticated;
-- Read-only matching: an email match does not grant access or convert an account.
CREATE OR REPLACE FUNCTION public.employee_account_matches(_company_id uuid)
RETURNS TABLE(employee_id uuid, match_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
BEGIN
 IF NOT public.company_team_has_access(_company_id,ARRAY['owner','admin','hiring_manager','reviewer']::public.company_member_role[]) THEN
  RAISE EXCEPTION 'Company access required';
 END IF;
 RETURN QUERY SELECT e.id, CASE
  WHEN nullif(trim(e.email),'') IS NULL THEN 'missing_email'
  WHEN u.id IS NULL THEN 'new_account'
  WHEN u.email_confirmed_at IS NULL THEN 'verification_required'
  WHEN o.id IS NULL THEN 'account_review_required'
  ELSE 'existing_officer_account' END
 FROM public.company_employee_imports e
 LEFT JOIN auth.users u ON lower(trim(e.email))=lower(u.email)
 LEFT JOIN public.officer_profiles o ON o.user_id=u.id
 WHERE e.company_id=_company_id;
END;$$;
REVOKE ALL ON FUNCTION public.employee_account_matches(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_account_matches(uuid) TO authenticated;
