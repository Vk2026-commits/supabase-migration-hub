BEGIN;
CREATE TABLE public.legacy_applicant_invitations (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES public.company_profiles(id),
 legacy_id uuid NOT NULL REFERENCES public.company_legacy_applications(id),
 group_id uuid NOT NULL,
 job_posting_id uuid NOT NULL REFERENCES public.job_postings(id),
 recipient_email text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 revoked_at timestamptz,
 claimed_at timestamptz,
 claimed_by uuid REFERENCES auth.users(id),
 master_application_id uuid REFERENCES public.guard_hiring_applications(id),
 job_application_id uuid REFERENCES public.job_applications(id),
 confirmed_at timestamptz,
 email_status text NOT NULL DEFAULT 'sending' CHECK(email_status IN ('sending','accepted','delivered','failed','bounced','complained')),
 provider_id text,
 last_error text
);
ALTER TABLE public.legacy_applicant_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_applicant_invitations FROM anon,authenticated;
GRANT SELECT(id,company_id,legacy_id,group_id,job_posting_id,recipient_email,expires_at,created_at,revoked_at,claimed_at,confirmed_at,email_status,last_error) ON public.legacy_applicant_invitations TO authenticated;
CREATE POLICY legacy_invite_company_read ON public.legacy_applicant_invitations FOR SELECT TO authenticated USING(public.company_team_has_access(company_id));
CREATE INDEX ON public.legacy_applicant_invitations(company_id,created_at DESC);

CREATE FUNCTION public.reserve_legacy_invitation(_request_id uuid,_legacy_id uuid,_job_id uuid,_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.company_legacy_applications; previous public.legacy_applicant_invitations; g uuid;
BEGIN
 SELECT * INTO r FROM public.company_legacy_applications WHERE id=_legacy_id;
 IF r.id IS NULL OR NOT public.company_team_has_access(r.company_id,ARRAY['owner','admin','hiring_manager']::public.company_member_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF r.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'A valid applicant email is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_postings WHERE id=_job_id AND company_id=r.company_id AND status='active') THEN RAISE EXCEPTION 'Select an active job for this company'; END IF;
 g:=coalesce(r.duplicate_group_id,r.id);
 PERFORM pg_advisory_xact_lock(hashtextextended(g::text,6));
 SELECT * INTO previous FROM public.legacy_applicant_invitations WHERE id=_request_id;
 IF FOUND THEN
   IF previous.company_id<>r.company_id OR previous.group_id<>g OR previous.job_posting_id<>_job_id THEN RAISE EXCEPTION 'Invitation request mismatch'; END IF;
   RETURN jsonb_build_object('created',false,'id',previous.id,'email_status',previous.email_status);
 END IF;
 IF EXISTS(SELECT 1 FROM public.legacy_applicant_invitations WHERE group_id=g AND company_id=r.company_id AND revoked_at IS NULL AND claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'This applicant already accepted an invitation. Open their application instead.'; END IF;
 IF EXISTS(SELECT 1 FROM public.legacy_applicant_invitations WHERE group_id=g AND revoked_at IS NULL AND email_status='sending' AND created_at>now()-interval '2 minutes') THEN RAISE EXCEPTION 'An invitation is already being sent. Refresh its status before trying again.'; END IF;
 UPDATE public.legacy_applicant_invitations SET revoked_at=now() WHERE group_id=g AND company_id=r.company_id AND revoked_at IS NULL;
 INSERT INTO public.legacy_applicant_invitations(id,company_id,legacy_id,group_id,job_posting_id,recipient_email,token_hash,created_by)
 VALUES(_request_id,r.company_id,r.id,g,_job_id,lower(trim(r.email)),_token_hash,auth.uid());
 RETURN jsonb_build_object('created',true,'id',_request_id,'email',lower(trim(r.email)),'company_id',r.company_id);
END; $$;
REVOKE ALL ON FUNCTION public.reserve_legacy_invitation(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_legacy_invitation(uuid,uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.claim_legacy_invitation(_token text,_apply boolean DEFAULT false,_prefill jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE inv public.legacy_applicant_invitations; legacy public.company_legacy_applications; account record; officer uuid; master public.guard_hiring_applications; existing_job uuid; merged jsonb; pair record; company text;
BEGIN
 SELECT id,email,email_confirmed_at INTO account FROM auth.users WHERE id=auth.uid();
 IF account.id IS NULL OR account.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Sign in with a verified email to view this application'; END IF;
 SELECT * INTO inv FROM public.legacy_applicant_invitations WHERE token_hash=encode(extensions.digest(_token,'sha256'),'hex') FOR UPDATE;
 IF inv.id IS NULL OR inv.revoked_at IS NOT NULL OR (inv.claimed_at IS NULL AND inv.expires_at<now()) THEN RAISE EXCEPTION 'Invitation expired or unavailable. Ask Kairos for a new invitation.'; END IF;
 IF lower(account.email)<>inv.recipient_email OR (inv.claimed_by IS NOT NULL AND inv.claimed_by<>account.id) THEN RAISE EXCEPTION 'Sign in using the email address that received this invitation'; END IF;
 SELECT * INTO legacy FROM public.company_legacy_applications WHERE id=inv.legacy_id;
 SELECT company_name INTO company FROM public.company_profiles WHERE id=inv.company_id;
 SELECT id INTO officer FROM public.officer_profiles WHERE user_id=account.id;
 SELECT id INTO existing_job FROM public.job_applications WHERE officer_id=officer AND job_posting_id=inv.job_posting_id AND NOT test_archived LIMIT 1;
 IF NOT _apply THEN RETURN jsonb_build_object('legacy',to_jsonb(legacy),'company_name',company,'job_id',inv.job_posting_id,'claimed',inv.claimed_at IS NOT NULL,'existing_application',existing_job IS NOT NULL); END IF;
 IF inv.claimed_at IS NOT NULL THEN RETURN jsonb_build_object('job_id',inv.job_posting_id,'existing_application',inv.job_application_id IS NOT NULL); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.job_postings WHERE id=inv.job_posting_id AND status='active') THEN RAISE EXCEPTION 'This position is no longer active. Contact the company.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(account.id::text,7));
 IF officer IS NULL THEN
   INSERT INTO public.officer_profiles(user_id) VALUES(account.id) RETURNING id INTO officer;
 END IF;
 -- An existing application is never reset or resubmitted by claiming an invite.
 SELECT id INTO existing_job FROM public.job_applications WHERE officer_id=officer AND job_posting_id=inv.job_posting_id AND NOT test_archived LIMIT 1;
 IF existing_job IS NULL THEN
   SELECT * INTO master FROM public.guard_hiring_applications WHERE user_id=account.id AND application_type='master' AND NOT test_archived ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
   merged:=coalesce(master.application_data,'{}'::jsonb);
   IF master.id IS NULL OR master.status='draft' THEN
     -- Prefer current profile values over historical contact data when the draft is empty.
     FOR pair IN SELECT key,value FROM jsonb_each((SELECT jsonb_build_object('applicantName',p.full_name,'email',p.email,'phone',o.phone,'address',o.address_street,'city',o.address_city,'state',o.address_state,'zip',o.address_zip) FROM officer_profiles o JOIN profiles p ON p.id=o.user_id WHERE o.id=officer)) LOOP
       IF (NOT merged ? pair.key OR merged->pair.key IN ('null'::jsonb,'""'::jsonb)) AND pair.value NOT IN ('null'::jsonb,'""'::jsonb) THEN merged:=jsonb_set(merged,ARRAY[pair.key],pair.value); END IF;
     END LOOP;
     IF jsonb_typeof(merged->'workHistory')='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(merged->'workHistory') x WHERE coalesce(x->>'employer','')<>'') THEN merged:=merged-'workHistory'; END IF;
     IF jsonb_typeof(merged->'references')='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(merged->'references') x WHERE coalesce(x->>'name','')<>'') THEN merged:=merged-'references'; END IF;
     IF jsonb_typeof(merged->'schoolHistory')='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(merged->'schoolHistory') x WHERE coalesce(x->>'name','')<>'' OR coalesce(x->>'attended','')<>'') THEN merged:=merged-'schoolHistory'; END IF;
     -- Fill only missing fields after an explicit applicant action. No signatures, consents or SSNs accepted.
     FOR pair IN SELECT key,value FROM jsonb_each(_prefill) LOOP
       IF pair.key=ANY(ARRAY['applicantName','firstName','middleName','lastName','email','phone','address','city','state','zip','position','employmentType','startDate','licenseLevels','eligibleToWork','isAdult','driversLicense','driversLicenseNumber','licenseClass','driverLicenseState','appliedBefore','appliedBeforeWhen','employedHereBefore','employedHereWhen','convicted','convictionDetails','outsideEmployment','outsideEmploymentDetails','licenseSuspended','licenseSuspendedDetails','professionalActivities','skills','machinesEquipment','schoolHistory','workHistory','references','otherNamesUsed','otherNames','presentlyEmployed','contactSuggestion','everFired','firedDetails','hasWorkHistory','hasReferences','education'])
          AND (NOT merged ? pair.key OR merged->pair.key IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb)) THEN merged:=jsonb_set(merged,ARRAY[pair.key],pair.value); END IF;
     END LOOP;
     merged:=merged || jsonb_build_object('jobPostingId',inv.job_posting_id,'companyName',company,'signature','','signatureImage','','signatureDate','','consentAccepted',false,'legacyInvitationId',inv.id,'legacyOriginalSubmittedAt',legacy.source_submitted_at);
     IF master.id IS NULL THEN
       INSERT INTO public.guard_hiring_applications(user_id,officer_id,application_type,status,current_step,applicant_name,applicant_email,company_name,position,application_data)
       VALUES(account.id,officer,'master','draft',0,coalesce(merged->>'applicantName',legacy.applicant_name),account.email,company,coalesce(nullif(merged->>'position',''),legacy.position,(SELECT title FROM job_postings WHERE id=inv.job_posting_id)),merged) RETURNING * INTO master;
     ELSE UPDATE public.guard_hiring_applications SET application_data=merged WHERE id=master.id; END IF;
   END IF;
 END IF;
 UPDATE public.legacy_applicant_invitations SET claimed_at=now(),claimed_by=account.id,master_application_id=master.id,job_application_id=existing_job WHERE id=inv.id;
 UPDATE public.company_legacy_applications SET matched_officer_id=officer WHERE company_id=inv.company_id AND coalesce(duplicate_group_id,id)=inv.group_id;
 RETURN jsonb_build_object('job_id',inv.job_posting_id,'existing_application',existing_job IS NOT NULL,'preserved_submitted_master',master.status='submitted');
END; $$;
REVOKE ALL ON FUNCTION public.claim_legacy_invitation(text,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_legacy_invitation(text,boolean,jsonb) TO authenticated;

ALTER TABLE public.guard_hiring_applications ADD COLUMN legacy_original_submitted_at timestamptz;
CREATE FUNCTION public.record_legacy_confirmation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE original timestamptz;
BEGIN
 IF NEW.application_type='employer_copy' AND NEW.status='submitted' THEN
   SELECT l.source_submitted_at INTO original FROM public.legacy_applicant_invitations i
     JOIN public.company_legacy_applications l ON l.id=i.legacy_id
     JOIN public.job_applications j ON j.id=NEW.job_application_id
     WHERE i.claimed_by=NEW.user_id AND i.job_posting_id=j.job_posting_id AND i.claimed_at IS NOT NULL AND i.revoked_at IS NULL LIMIT 1;
   IF original IS NOT NULL THEN
     NEW.legacy_original_submitted_at:=original;
     UPDATE public.legacy_applicant_invitations SET confirmed_at=NEW.submitted_at,job_application_id=NEW.job_application_id
       WHERE claimed_by=NEW.user_id AND job_posting_id=(SELECT job_posting_id FROM public.job_applications WHERE id=NEW.job_application_id) AND claimed_at IS NOT NULL AND revoked_at IS NULL;
   END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER record_legacy_confirmation BEFORE INSERT OR UPDATE OF status,submitted_at ON public.guard_hiring_applications FOR EACH ROW EXECUTE FUNCTION public.record_legacy_confirmation();
COMMIT;
