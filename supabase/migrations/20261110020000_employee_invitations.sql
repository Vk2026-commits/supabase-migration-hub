-- Manual employee setup invitations. No accounts or emails are created by migration.
BEGIN;
ALTER TABLE public.company_employee_imports
 ADD COLUMN proposed_hire_date date,
 ADD COLUMN hire_date_proposed_at timestamptz,
 ADD COLUMN hire_date_reviewed_at timestamptz,
 ADD COLUMN hire_date_reviewed_by uuid REFERENCES auth.users(id);
GRANT SELECT(proposed_hire_date,hire_date_proposed_at,hire_date_reviewed_at) ON public.company_employee_imports TO authenticated;
CREATE TABLE public.employee_record_invitations (
 id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES public.company_employee_imports(id),
 company_id uuid NOT NULL REFERENCES public.company_profiles(id),
 recipient_email text NOT NULL, token_hash text NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', revoked_at timestamptz,
 claimed_at timestamptz, claimed_by uuid REFERENCES auth.users(id),
 email_status text NOT NULL DEFAULT 'sending' CHECK(email_status IN ('sending','accepted','delivered','failed','unknown','bounced','complained')),
 provider_id text, last_error text
);
CREATE UNIQUE INDEX employee_record_invitation_live ON public.employee_record_invitations(employee_id) WHERE revoked_at IS NULL;
ALTER TABLE public.employee_record_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_record_invitations FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,employee_id,company_id,recipient_email,created_at,expires_at,revoked_at,claimed_at,email_status,last_error) ON public.employee_record_invitations TO authenticated;
CREATE POLICY employee_invitation_read ON public.employee_record_invitations FOR SELECT TO authenticated USING(public.company_team_has_access(company_id));
CREATE FUNCTION public.reserve_employee_invitation(_request_id uuid,_employee_id uuid,_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.company_employee_imports; i public.employee_record_invitations;
BEGIN
 SELECT * INTO e FROM public.company_employee_imports WHERE id=_employee_id FOR UPDATE;
 IF e.id IS NULL OR NOT public.company_team_has_access(e.company_id,ARRAY['owner','admin','hiring_manager']::public.company_member_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF e.invitation_excluded OR coalesce(e.email,'') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'This employee is excluded or has no valid email'; END IF;
 IF _token_hash !~ '^[a-f0-9]{64}$' OR _token_hash IS NULL OR _request_id IS NULL THEN RAISE EXCEPTION 'Invalid invitation request'; END IF;
 SELECT * INTO i FROM public.employee_record_invitations WHERE id=_request_id;
 IF FOUND THEN
  IF i.employee_id<>e.id OR i.company_id<>e.company_id THEN RAISE EXCEPTION 'Invitation request mismatch'; END IF;
  RETURN jsonb_build_object('created',false,'id',i.id,'email_status',i.email_status);
 END IF;
 IF e.linked_user_id IS NOT NULL OR e.status IN ('claimed','complete') THEN RAISE EXCEPTION 'Employee already connected'; END IF;
 -- Never convert an existing company/service account into an officer account.
 IF EXISTS(SELECT 1 FROM auth.users u WHERE lower(u.email)=lower(trim(e.email)) AND NOT EXISTS(SELECT 1 FROM public.officer_profiles o WHERE o.user_id=u.id)) THEN RAISE EXCEPTION 'Existing account needs review before invitation'; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_record_invitations WHERE employee_id=e.id AND revoked_at IS NULL AND email_status IN ('sending','unknown')) THEN RAISE EXCEPTION 'Delivery is pending or uncertain. Check delivery before resending'; END IF;
 UPDATE public.employee_record_invitations SET revoked_at=now() WHERE employee_id=e.id AND revoked_at IS NULL;
 INSERT INTO public.employee_record_invitations(id,employee_id,company_id,recipient_email,token_hash,created_by) VALUES(_request_id,e.id,e.company_id,lower(trim(e.email)),_token_hash,auth.uid());
 RETURN jsonb_build_object('created',true,'id',_request_id,'email',lower(trim(e.email)));
END;$$;
REVOKE ALL ON FUNCTION public.reserve_employee_invitation(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_employee_invitation(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.claim_employee_invitation(_token text,_apply boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE i public.employee_record_invitations; e public.company_employee_imports; u auth.users; officer uuid; company text;
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.id IS NULL OR u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Sign in with a verified email first'; END IF;
 SELECT * INTO i FROM public.employee_record_invitations WHERE token_hash=encode(extensions.digest(_token,'sha256'),'hex');
 -- Match reservation lock order: employee first, invitation second.
 IF i.id IS NOT NULL THEN
  PERFORM 1 FROM public.company_employee_imports WHERE id=i.employee_id FOR UPDATE;
  SELECT * INTO i FROM public.employee_record_invitations WHERE id=i.id FOR UPDATE;
 END IF;
 IF i.id IS NULL OR i.revoked_at IS NOT NULL OR (i.claimed_at IS NULL AND i.expires_at<=now()) THEN RAISE EXCEPTION 'Invitation expired or unavailable. Ask your company for a new link'; END IF;
 IF lower(u.email)<>i.recipient_email OR (i.claimed_by IS NOT NULL AND i.claimed_by<>u.id) THEN RAISE EXCEPTION 'Sign in with the email address that received this invitation'; END IF;
 SELECT * INTO e FROM public.company_employee_imports WHERE id=i.employee_id FOR UPDATE;
 IF e.invitation_excluded OR lower(trim(e.email))<>i.recipient_email THEN RAISE EXCEPTION 'Invitation is no longer available'; END IF;
 IF e.linked_user_id IS NOT NULL AND e.linked_user_id<>u.id THEN RAISE EXCEPTION 'Employee record is already connected'; END IF;
 SELECT id INTO officer FROM public.officer_profiles WHERE user_id=u.id;
 SELECT company_name INTO company FROM public.company_profiles WHERE id=e.company_id;
 IF _apply THEN
  IF officer IS NULL THEN RAISE EXCEPTION 'Create and verify an officer account before connecting your records'; END IF;
  -- Replaying a claimed link can only reopen the same user/record; no reset or overwrite.
  UPDATE public.company_employee_imports SET linked_user_id=u.id,linked_officer_id=officer,status=CASE WHEN status='complete' THEN status ELSE 'claimed' END WHERE id=e.id;
  UPDATE public.employee_record_invitations SET claimed_at=coalesce(claimed_at,now()),claimed_by=u.id WHERE id=i.id;
 END IF;
 RETURN jsonb_build_object('employee_id',e.id,'company_id',e.company_id,'company_name',company,'first_name',e.first_name,'last_name',e.last_name,'phone',e.phone,'position',e.position_title,'hire_date',e.hire_date,'proposed_hire_date',e.proposed_hire_date,'claimed',i.claimed_at IS NOT NULL OR _apply,'has_officer_profile',officer IS NOT NULL);
END;$$;
REVOKE ALL ON FUNCTION public.claim_employee_invitation(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_employee_invitation(text,boolean) TO authenticated;
-- Employees propose missing dates; authorized company staff confirm them.
CREATE FUNCTION public.propose_employee_hire_date(_employee_id uuid,_hire_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.company_employee_imports;
BEGIN
 SELECT * INTO e FROM public.company_employee_imports WHERE id=_employee_id FOR UPDATE;
 IF e.id IS NULL OR auth.uid() IS NULL OR e.linked_user_id IS DISTINCT FROM auth.uid() OR e.invitation_excluded
 OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF e.hire_date IS NOT NULL THEN RAISE EXCEPTION 'The original hire date is already recorded. Contact your company to correct it'; END IF;
 IF _hire_date IS NULL OR _hire_date>current_date THEN RAISE EXCEPTION 'Enter your actual original hire date, not a future date'; END IF;
 UPDATE public.company_employee_imports SET proposed_hire_date=_hire_date,hire_date_proposed_at=now() WHERE id=e.id;
END;$$;
REVOKE ALL ON FUNCTION public.propose_employee_hire_date(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propose_employee_hire_date(uuid,date) TO authenticated;
CREATE FUNCTION public.review_employee_hire_date(_employee_id uuid,_expected_date date,_approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.company_employee_imports;
BEGIN
 SELECT * INTO e FROM public.company_employee_imports WHERE id=_employee_id FOR UPDATE;
 IF e.id IS NULL OR NOT public.company_team_has_access(e.company_id,ARRAY['owner','admin','hiring_manager']::public.company_member_role[])
 THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF e.invitation_excluded OR e.hire_date IS NOT NULL OR e.proposed_hire_date IS NULL OR e.proposed_hire_date IS DISTINCT FROM _expected_date OR _approve IS NULL
 THEN RAISE EXCEPTION 'Hire date changed or unavailable. Refresh and review again'; END IF;
 UPDATE public.company_employee_imports SET hire_date=CASE WHEN _approve THEN proposed_hire_date ELSE NULL END,
 proposed_hire_date=CASE WHEN _approve THEN proposed_hire_date ELSE NULL END,
 hire_date_reviewed_at=now(),hire_date_reviewed_by=auth.uid() WHERE id=e.id;
END;$$;
REVOKE ALL ON FUNCTION public.review_employee_hire_date(uuid,date,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_employee_hire_date(uuid,date,boolean) TO authenticated;
COMMIT;
