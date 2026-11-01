-- Explicitly registered synthetic applicants. No email/name heuristic grants test access.
CREATE TABLE public.hiring_test_accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 officer_id uuid NOT NULL UNIQUE REFERENCES public.officer_profiles(id),
 company_id uuid NOT NULL REFERENCES public.company_profiles(id),
 job_posting_id uuid NOT NULL REFERENCES public.job_postings(id),
 active_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
 application_seed jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hiring_test_runs (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.hiring_test_accounts(user_id),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 outcome text,
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.hiring_test_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_test_runs ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.can_manage_hiring_test(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM hiring_test_accounts t WHERE t.user_id=_user_id AND
 (t.user_id=auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role)
 OR public.company_team_has_access(t.company_id,ARRAY['owner','admin','hiring_manager']::public.company_member_role[])))
$$;
REVOKE ALL ON FUNCTION public.can_manage_hiring_test(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_hiring_test(uuid) TO authenticated;
CREATE POLICY test_account_read ON hiring_test_accounts FOR SELECT TO authenticated USING (can_manage_hiring_test(user_id));
CREATE POLICY test_history_read ON hiring_test_runs FOR SELECT TO authenticated USING (can_manage_hiring_test(user_id));
REVOKE ALL ON hiring_test_accounts,hiring_test_runs FROM anon,authenticated;
GRANT SELECT ON hiring_test_accounts,hiring_test_runs TO authenticated;
ALTER TABLE public.job_applications ADD COLUMN test_run_id uuid, ADD COLUMN test_archived boolean NOT NULL DEFAULT false;
CREATE POLICY hide_completed_test_runs ON public.job_applications AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT test_archived) WITH CHECK (NOT test_archived);
ALTER TABLE public.guard_hiring_applications ADD COLUMN test_run_id uuid, ADD COLUMN test_archived boolean NOT NULL DEFAULT false;
CREATE POLICY hide_completed_test_runs ON public.guard_hiring_applications AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT test_archived) WITH CHECK (NOT test_archived);
ALTER TABLE public.hires ADD COLUMN test_run_id uuid, ADD COLUMN test_archived boolean NOT NULL DEFAULT false;
CREATE POLICY hide_completed_test_runs ON public.hires AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT test_archived) WITH CHECK (NOT test_archived);
ALTER TABLE public.employment_offers ADD COLUMN test_run_id uuid, ADD COLUMN test_archived boolean NOT NULL DEFAULT false;
CREATE POLICY hide_completed_test_runs ON public.employment_offers AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT test_archived) WITH CHECK (NOT test_archived);
ALTER TABLE public.officer_onboarding_packets ADD COLUMN test_run_id uuid, ADD COLUMN test_archived boolean NOT NULL DEFAULT false;
CREATE POLICY hide_completed_test_runs ON public.officer_onboarding_packets AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT test_archived) WITH CHECK (NOT test_archived);
ALTER TABLE public.interview_schedules ADD COLUMN test_run_id uuid, ADD COLUMN test_archived boolean NOT NULL DEFAULT false;
CREATE POLICY hide_completed_test_runs ON public.interview_schedules AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT test_archived) WITH CHECK (NOT test_archived);
ALTER TABLE public.hire_screening_checks ADD COLUMN test_run_id uuid, ADD COLUMN test_archived boolean NOT NULL DEFAULT false;
CREATE POLICY hide_completed_test_runs ON public.hire_screening_checks AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT test_archived) WITH CHECK (NOT test_archived);
-- Retain original rows and foreign keys; uniqueness applies to active applications.
ALTER TABLE public.job_applications DROP CONSTRAINT job_applications_job_posting_id_officer_id_key;
CREATE UNIQUE INDEX job_applications_active_officer_job ON public.job_applications(job_posting_id,officer_id) WHERE NOT test_archived;
DROP INDEX public.guard_hiring_applications_one_master_per_officer;
CREATE UNIQUE INDEX guard_hiring_applications_one_master_per_officer ON public.guard_hiring_applications(officer_id) WHERE application_type='master' AND NOT test_archived;


DO $$
DECLARE u uuid:='c2d2969a-dbb3-45e5-910b-a7c9e4730aa2'; o uuid:='4dd7fbb8-f59a-4ea5-a15f-9c8f400ebbd5'; old_run uuid:=gen_random_uuid(); new_run uuid:=gen_random_uuid();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND lower(email)='vektiss@gmail.com') OR NOT EXISTS(SELECT 1 FROM officer_profiles WHERE id=o AND user_id=u) THEN RAISE EXCEPTION 'Verified test account does not match'; END IF;
 IF NOT EXISTS(SELECT 1 FROM job_postings WHERE id='3665bcce-eb1b-44ce-a001-90d494eab528' AND company_id='abaebf12-8db2-44f7-b60e-a8931405df88' AND status='active') THEN RAISE EXCEPTION 'Kairos position unavailable'; END IF;
 INSERT INTO hiring_test_accounts(user_id,officer_id,company_id,job_posting_id,active_run_id,application_seed)
 VALUES(u,o,'abaebf12-8db2-44f7-b60e-a8931405df88','3665bcce-eb1b-44ce-a001-90d494eab528',new_run,$seed${"applicantName": "Kairos Test Officer", "email": "vektiss@gmail.com", "phone": "713-555-0100", "address": "100 Sample Training Way", "city": "Houston", "state": "TX", "zip": "77060", "companyName": "Kairos Security", "companyCity": "Houston", "companyState": "Texas", "position": "Armed Security Officer", "employmentType": "full-time", "licenseLevels": ["Level III"], "eligibleToWork": "Yes", "isAdult": "Yes", "driversLicense": "Yes", "securityLicenseNumber": "SAMPLE-NOT-VALID", "securityLicenseState": "TX", "education": "SAMPLE: High school diploma; security training", "skills": "SAMPLE: Report writing, de-escalation, patrol, first aid / CPR", "workHistory": [{"employer": "SAMPLE Training Security \u2014 Do not contact", "title": "Security Officer (synthetic)", "startDate": "2022-01-01", "endDate": "2025-12-31", "supervisor": "Sample Supervisor", "phone": "713-555-0101", "reason": "Test application only"}], "references": [{"name": "Sample Reference One \u2014 Do not contact", "relationship": "Synthetic supervisor", "phone": "713-555-0102", "email": "reference1@example.invalid"}, {"name": "Sample Reference Two \u2014 Do not contact", "relationship": "Synthetic coworker", "phone": "713-555-0103", "email": "reference2@example.invalid"}, {"name": "Sample Reference Three \u2014 Do not contact", "relationship": "Synthetic trainer", "phone": "713-555-0104", "email": "reference3@example.invalid"}], "availability": {"employmentTypes": ["full-time"], "shiftPreferences": ["day"], "schedule": {"Monday": {"start": "08:00", "end": "17:00"}, "Tuesday": {"start": "08:00", "end": "17:00"}, "Wednesday": {"start": "08:00", "end": "17:00"}, "Thursday": {"start": "08:00", "end": "17:00"}, "Friday": {"start": "08:00", "end": "17:00"}}}, "signature": "", "signatureImage": "", "consentAccepted": false, "visitedSteps": [], "completedSteps": [], "isTestApplication": true}$seed$::jsonb);
 INSERT INTO hiring_test_runs(id,user_id,finished_at,outcome,snapshot) VALUES(old_run,u,now(),'Previous test data preserved',jsonb_build_object('profile',(SELECT to_jsonb(p) FROM profiles p WHERE id=u),'officer',(SELECT to_jsonb(p) FROM officer_profiles p WHERE id=o)));
 INSERT INTO hiring_test_runs(id,user_id) VALUES(new_run,u);
 UPDATE job_applications SET test_run_id=old_run,test_archived=true WHERE officer_id=o;
 UPDATE guard_hiring_applications SET test_run_id=old_run,test_archived=true WHERE officer_id=o;
 UPDATE hires SET test_run_id=old_run,test_archived=true WHERE officer_id=o;
 UPDATE employment_offers SET test_run_id=old_run,test_archived=true WHERE officer_id=o;
 UPDATE officer_onboarding_packets SET test_run_id=old_run,test_archived=true WHERE officer_id=o;
 UPDATE interview_schedules SET test_run_id=old_run,test_archived=true WHERE officer_id=o;
 UPDATE hire_screening_checks SET test_run_id=old_run,test_archived=true WHERE hire_id IN (SELECT id FROM hires WHERE officer_id=o);
 UPDATE profiles SET full_name='Kairos Test Officer' WHERE id=u;
 UPDATE officer_profiles SET title='Armed Security Officer — TEST ACCOUNT',phone='713-555-0100',address_street='100 Sample Training Way',address_city='Houston',address_state='TX',address_zip='77060',employment_type=ARRAY['full-time'],shift_preference=ARRAY['day'],availability_schedule=(SELECT application_seed->'availability'->'schedule' FROM hiring_test_accounts WHERE user_id=u) WHERE id=o;
 INSERT INTO guard_hiring_applications(officer_id,user_id,application_type,company_name,position,applicant_name,applicant_email,status,current_step,application_data,test_run_id)
 SELECT o,u,'master','Kairos Security','Armed Security Officer','Kairos Test Officer','vektiss@gmail.com','draft',0,
 application_seed||jsonb_build_object('testRunId',new_run,'jobPostingId',job_posting_id,'startDate',current_date::text,'signatureDate',current_date::text),new_run FROM hiring_test_accounts WHERE user_id=u;
END $$;

-- Resolve a test identity from either the officer or the parent hire.
CREATE FUNCTION public.guard_hiring_test_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.hiring_test_accounts; rowdata jsonb; officer uuid; parent_run uuid; parent_archived boolean;
BEGIN
 rowdata:=to_jsonb(NEW);
 officer:=nullif(rowdata->>'officer_id','')::uuid;
 IF officer IS NULL AND rowdata->>'hire_id' IS NOT NULL THEN
   SELECT officer_id,test_run_id,test_archived INTO officer,parent_run,parent_archived FROM hires WHERE id=(rowdata->>'hire_id')::uuid;
 END IF;
 SELECT * INTO t FROM hiring_test_accounts WHERE officer_id=officer FOR UPDATE;
 IF NOT FOUND THEN
   IF NEW.test_run_id IS NOT NULL OR NEW.test_archived THEN RAISE EXCEPTION 'Only registered test accounts may create test records'; END IF;
   RETURN NEW;
 END IF;
 -- Only reset_hiring_test can authorize this transaction's archive operation.
 IF current_setting('app.hiring_test_archive',true)=t.active_run_id::text AND TG_OP='UPDATE'
    AND NEW.test_archived AND NOT OLD.test_archived AND
    (to_jsonb(NEW)-'test_archived')=(to_jsonb(OLD)-'test_archived') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (OLD.test_archived OR OLD.test_run_id IS DISTINCT FROM t.active_run_id) THEN
   RAISE EXCEPTION 'This test run has ended. Reload to start the next test.' USING ERRCODE='40001';
 END IF;
 IF NEW.test_archived OR (NEW.test_run_id IS NOT NULL AND NEW.test_run_id<>t.active_run_id) OR coalesce(parent_archived,false) THEN
   RAISE EXCEPTION 'Stale test run. Reload before saving.' USING ERRCODE='40001';
 END IF;
 IF rowdata->>'company_id' IS NOT NULL AND (rowdata->>'company_id')::uuid<>t.company_id THEN RAISE EXCEPTION 'This test account is restricted to Kairos Security'; END IF;
 IF TG_TABLE_NAME='job_applications' AND (rowdata->>'job_posting_id')::uuid<>t.job_posting_id THEN RAISE EXCEPTION 'Use the designated Kairos test position'; END IF;
 IF TG_TABLE_NAME='guard_hiring_applications' AND rowdata->>'application_type'='master'
    AND rowdata#>>'{application_data,testRunId}' IS DISTINCT FROM t.active_run_id::text THEN
   RAISE EXCEPTION 'Stale test application. Reload before saving.' USING ERRCODE='40001';
 END IF;
 IF rowdata->>'hire_id' IS NOT NULL AND EXISTS(SELECT 1 FROM hires WHERE id=(rowdata->>'hire_id')::uuid AND test_archived) THEN RAISE EXCEPTION 'This test hire has been archived'; END IF;
 IF rowdata->>'job_application_id' IS NOT NULL AND EXISTS(SELECT 1 FROM job_applications WHERE id=(rowdata->>'job_application_id')::uuid AND test_archived) THEN RAISE EXCEPTION 'This test application has been archived'; END IF;
 IF rowdata->>'hiring_application_id' IS NOT NULL AND EXISTS(SELECT 1 FROM guard_hiring_applications WHERE id=(rowdata->>'hiring_application_id')::uuid AND test_archived) THEN RAISE EXCEPTION 'This test application has been archived'; END IF;
 NEW.test_run_id:=t.active_run_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_hiring_test_write() FROM PUBLIC;
CREATE TRIGGER a_hiring_test_guard BEFORE INSERT OR UPDATE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.guard_hiring_test_write();
CREATE TRIGGER a_hiring_test_guard BEFORE INSERT OR UPDATE ON public.guard_hiring_applications FOR EACH ROW EXECUTE FUNCTION public.guard_hiring_test_write();
CREATE TRIGGER a_hiring_test_guard BEFORE INSERT OR UPDATE ON public.hires FOR EACH ROW EXECUTE FUNCTION public.guard_hiring_test_write();
CREATE TRIGGER a_hiring_test_guard BEFORE INSERT OR UPDATE ON public.employment_offers FOR EACH ROW EXECUTE FUNCTION public.guard_hiring_test_write();
CREATE TRIGGER a_hiring_test_guard BEFORE INSERT OR UPDATE ON public.officer_onboarding_packets FOR EACH ROW EXECUTE FUNCTION public.guard_hiring_test_write();
CREATE TRIGGER a_hiring_test_guard BEFORE INSERT OR UPDATE ON public.interview_schedules FOR EACH ROW EXECUTE FUNCTION public.guard_hiring_test_write();
CREATE TRIGGER a_hiring_test_guard BEFORE INSERT OR UPDATE ON public.hire_screening_checks FOR EACH ROW EXECUTE FUNCTION public.guard_hiring_test_write();
-- Persist the signed master application, the job link, and the employer copy
-- in one short transaction. This replaces a long client-side chain of RLS
-- queries that was vulnerable to statement timeouts when Disk IO was busy.
CREATE OR REPLACE FUNCTION public.submit_my_hiring_application(
  _master_application_id uuid,
  _officer_id uuid,
  _job_posting_id uuid,
  _position text,
  _applicant_name text,
  _applicant_email text,
  _signature_name text,
  _signature_date date,
  _application_data jsonb
)
RETURNS TABLE (
  master_application_id uuid,
  employer_application_id uuid,
  job_application_id uuid,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requesting_user_id uuid := auth.uid();
  job_record record;
  saved_master_id uuid;
  saved_job_application_id uuid;
  saved_employer_application_id uuid;
  submission_time timestamptz := clock_timestamp();
BEGIN
  IF requesting_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.officer_profiles officer
    WHERE officer.id = _officer_id
      AND officer.user_id = requesting_user_id
  ) THEN
    RAISE EXCEPTION 'You are not authorized to submit this application';
  END IF;

  IF EXISTS(SELECT 1 FROM hiring_test_accounts WHERE officer_id=_officer_id) AND NOT EXISTS(
    SELECT 1 FROM hiring_test_accounts t JOIN guard_hiring_applications a ON a.id=_master_application_id
    WHERE t.officer_id=_officer_id AND a.test_run_id=t.active_run_id AND NOT a.test_archived
      AND _application_data->>'testRunId'=t.active_run_id::text
  ) THEN RAISE EXCEPTION 'Stale test application. Reload before submitting.' USING ERRCODE='40001'; END IF;
  SELECT posting.id, posting.title, company.company_name
  INTO job_record
  FROM public.job_postings posting
  JOIN public.company_profiles company ON company.id = posting.company_id
  WHERE posting.id = _job_posting_id;

  IF job_record.id IS NULL THEN
    RAISE EXCEPTION 'The selected position is no longer available';
  END IF;

  INSERT INTO public.job_applications (job_posting_id, officer_id, status)
  VALUES (_job_posting_id, _officer_id, 'interested')
  ON CONFLICT (job_posting_id, officer_id) WHERE NOT test_archived DO NOTHING;

  SELECT application.id
  INTO saved_job_application_id
  FROM public.job_applications application
  WHERE application.job_posting_id = _job_posting_id
    AND application.officer_id = _officer_id AND NOT application.test_archived;

  IF _master_application_id IS NOT NULL THEN
    SELECT application.id
    INTO saved_master_id
    FROM public.guard_hiring_applications application
    WHERE application.id = _master_application_id
      AND application.officer_id = _officer_id
      AND application.user_id = requesting_user_id
      AND application.application_type = 'master' AND NOT application.test_archived;
  END IF;

  IF saved_master_id IS NULL THEN
    SELECT application.id
    INTO saved_master_id
    FROM public.guard_hiring_applications application
    WHERE application.officer_id = _officer_id
      AND application.application_type = 'master' AND NOT application.test_archived
    ORDER BY application.updated_at DESC
    LIMIT 1;
  END IF;

  IF saved_master_id IS NULL THEN
    INSERT INTO public.guard_hiring_applications (
      officer_id, user_id, application_type, job_application_id,
      company_name, position, applicant_name, applicant_email, status,
      current_step, signature_name, signature_date, submitted_at,
      application_data
    ) VALUES (
      _officer_id, requesting_user_id, 'master', NULL,
      'General We Find Guards Application', _position, _applicant_name,
      _applicant_email, 'submitted', 9, _signature_name, _signature_date,
      submission_time, _application_data
    )
    RETURNING id INTO saved_master_id;
  ELSE
    UPDATE public.guard_hiring_applications application
    SET position = _position,
        applicant_name = _applicant_name,
        applicant_email = _applicant_email,
        status = 'submitted',
        current_step = 9,
        signature_name = _signature_name,
        signature_date = _signature_date,
        submitted_at = submission_time,
        application_data = _application_data
    WHERE application.id = saved_master_id;
  END IF;

  -- If a response was lost after commit, return the matching submitted copy
  -- instead of creating a duplicate when the applicant taps Submit again.
  SELECT application.id
  INTO saved_employer_application_id
  FROM public.guard_hiring_applications application
  WHERE application.source_application_id = saved_master_id
    AND application.job_application_id = saved_job_application_id
    AND application.application_type = 'employer_copy'
    AND application.status = 'submitted'
    AND application.application_data = _application_data
  ORDER BY application.submitted_at DESC, application.created_at DESC
  LIMIT 1;

  IF saved_employer_application_id IS NULL THEN
    SELECT application.id
    INTO saved_employer_application_id
    FROM public.guard_hiring_applications application
    WHERE application.source_application_id = saved_master_id
      AND application.job_application_id = saved_job_application_id
      AND application.application_type = 'employer_copy'
      AND application.status = 'draft'
      AND application.evidence_snapshot_status IN ('pending', 'failed')
    ORDER BY application.created_at DESC
    LIMIT 1;
  END IF;

  IF saved_employer_application_id IS NULL THEN
    INSERT INTO public.guard_hiring_applications (
      officer_id, user_id, application_type, source_application_id,
      job_application_id, company_name, position, applicant_name,
      applicant_email, status, current_step, signature_name, signature_date,
      submitted_at, application_data, evidence_snapshot_status,
      evidence_snapshot_kind
    ) VALUES (
      _officer_id, requesting_user_id, 'employer_copy', saved_master_id,
      saved_job_application_id, job_record.company_name, job_record.title,
      _applicant_name, _applicant_email, 'submitted', 9, _signature_name,
      _signature_date, submission_time, _application_data, 'pending',
      'submission'
    )
    RETURNING id INTO saved_employer_application_id;
  ELSE
    UPDATE public.guard_hiring_applications application
    SET company_name = job_record.company_name,
        position = job_record.title,
        applicant_name = _applicant_name,
        applicant_email = _applicant_email,
        status = 'submitted',
        current_step = 9,
        signature_name = _signature_name,
        signature_date = _signature_date,
        submitted_at = COALESCE(application.submitted_at, submission_time),
        application_data = _application_data,
        evidence_snapshot_status = CASE
          WHEN application.evidence_snapshot_status = 'complete' THEN 'complete'
          ELSE 'pending'
        END,
        evidence_snapshot_kind = 'submission'
    WHERE application.id = saved_employer_application_id;
  END IF;

  RETURN QUERY SELECT
    saved_master_id,
    saved_employer_application_id,
    saved_job_application_id,
    submission_time;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_my_hiring_application(uuid, uuid, uuid, text, text, text, text, date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_my_hiring_application(uuid, uuid, uuid, text, text, text, text, date, jsonb) TO authenticated;


CREATE FUNCTION public.hiring_test_outcome(_run uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE
 WHEN EXISTS(SELECT 1 FROM hires WHERE test_run_id=_run AND employment_confirmed_at IS NOT NULL) THEN 'Hired'
 WHEN EXISTS(SELECT 1 FROM hires WHERE test_run_id=_run AND status='not_hired') THEN 'Not hired'
 WHEN EXISTS(SELECT 1 FROM job_applications WHERE test_run_id=_run AND status IN ('declined','not_selected','not_offered','withdrawn','archived')) THEN 'Not hired / archived'
 WHEN EXISTS(SELECT 1 FROM interview_schedules WHERE test_run_id=_run AND attendance_status='no_show') THEN 'Interview no-show'
 WHEN EXISTS(SELECT 1 FROM hire_screening_checks WHERE test_run_id=_run AND status='failed') THEN 'Failed verification'
 ELSE (SELECT outcome FROM hiring_test_runs WHERE id=_run) END
$$;
REVOKE ALL ON FUNCTION public.hiring_test_outcome(uuid) FROM PUBLIC;
CREATE FUNCTION public.get_hiring_test_account(_user_id uuid DEFAULT NULL,_company_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t hiring_test_accounts;
BEGIN
 SELECT * INTO t FROM hiring_test_accounts a WHERE (_user_id IS NULL OR a.user_id=_user_id)
 AND (_company_id IS NULL OR a.company_id=_company_id) AND can_manage_hiring_test(a.user_id) LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(t)-'application_seed' || jsonb_build_object('outcome',hiring_test_outcome(t.active_run_id),'history',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'started_at',r.started_at,'finished_at',r.finished_at,'outcome',r.outcome) ORDER BY r.started_at DESC),'[]') FROM hiring_test_runs r WHERE r.user_id=t.user_id AND r.finished_at IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION public.get_hiring_test_account(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hiring_test_account(uuid,uuid) TO authenticated;

CREATE FUNCTION public.reset_hiring_test(_user_id uuid,_expected_run_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t hiring_test_accounts; next_run uuid:=gen_random_uuid(); result text; records jsonb:='{}'; part jsonb; table_name text;
BEGIN
 IF NOT can_manage_hiring_test(_user_id) THEN RAISE EXCEPTION 'Not authorized to reset this test account'; END IF;
 SELECT * INTO t FROM hiring_test_accounts WHERE user_id=_user_id FOR UPDATE;
 -- Lost-response retries and double clicks return the already-created run.
 IF t.active_run_id<>_expected_run_id THEN RETURN t.active_run_id; END IF;
 result:=hiring_test_outcome(t.active_run_id);
 IF result IS NULL THEN RAISE EXCEPTION 'Finish a hiring outcome before starting the next test'; END IF;
 FOREACH table_name IN ARRAY ARRAY['job_applications','guard_hiring_applications','hires','employment_offers','officer_onboarding_packets','interview_schedules','hire_screening_checks'] LOOP
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r)),''[]'') FROM public.%I r WHERE test_run_id=$1',table_name) INTO part USING t.active_run_id;
   records:=records||jsonb_build_object(table_name,part);
 END LOOP;
 UPDATE hiring_test_runs SET finished_at=now(),outcome=result,snapshot=records WHERE id=t.active_run_id;
 PERFORM set_config('app.hiring_test_archive',t.active_run_id::text,true);
 FOREACH table_name IN ARRAY ARRAY['hire_screening_checks','officer_onboarding_packets','employment_offers','interview_schedules','hires','guard_hiring_applications','job_applications'] LOOP
   EXECUTE format('UPDATE public.%I SET test_archived=true WHERE test_run_id=$1 AND NOT test_archived',table_name) USING t.active_run_id;
 END LOOP;
 UPDATE hiring_submission_jobs j SET status='complete',completed_at=now(),lease_id=null,lease_until=null,last_error='Test run archived'
 WHERE j.attempt_id IN (SELECT r.attempt_id FROM hiring_submission_receipts r JOIN job_applications a ON a.id=r.job_application_id WHERE a.test_run_id=t.active_run_id)
 AND j.status<>'complete';
 UPDATE hiring_test_accounts SET active_run_id=next_run WHERE user_id=t.user_id;
 INSERT INTO hiring_test_runs(id,user_id) VALUES(next_run,t.user_id);
 INSERT INTO guard_hiring_applications(officer_id,user_id,application_type,company_name,position,applicant_name,applicant_email,status,current_step,application_data,test_run_id)
 VALUES(t.officer_id,t.user_id,'master','Kairos Security','Armed Security Officer','Kairos Test Officer','vektiss@gmail.com','draft',0,
 t.application_seed||jsonb_build_object('testRunId',next_run,'jobPostingId',t.job_posting_id,'startDate',current_date::text,'signatureDate',current_date::text),next_run);
 RETURN next_run;
END $$;
REVOKE ALL ON FUNCTION public.reset_hiring_test(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_hiring_test(uuid,uuid) TO authenticated;

-- Prevent test workflows from ever sending external email, including cron jobs.
CREATE FUNCTION public.suppress_hiring_test_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM hiring_test_accounts t WHERE t.officer_id=NEW.officer_id OR t.user_id=NEW.recipient_user_id) THEN
 NEW.status:='cancelled'; NEW.next_send_at:=NULL; NEW.completed_at:=now();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_suppress_hiring_test_notifications BEFORE INSERT OR UPDATE ON public.notification_workflows FOR EACH ROW EXECUTE FUNCTION public.suppress_hiring_test_notifications();

-- Existing aggregate RPCs must omit archived runs even when bypassing RLS.
DO $$ DECLARE name text; def text; BEGIN
 FOREACH name IN ARRAY ARRAY['get_company_onboarding_progress','get_company_pending_onboarding_reviews'] LOOP
 SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
 IF def IS NOT NULL THEN
 def:=replace(def,'WHERE hire.company_id = _company_id','WHERE NOT hire.test_archived AND hire.company_id = _company_id');
 EXECUTE def;
 END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.submit_my_hiring_application_v2(
  _attempt_id uuid, _master_application_id uuid, _officer_id uuid, _job_posting_id uuid,
  _position text, _applicant_name text, _applicant_email text, _signature_name text,
  _signature_date date, _application_data jsonb
)
RETURNS TABLE(master_application_id uuid, employer_application_id uuid, job_application_id uuid, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  receipt public.hiring_submission_receipts;
  saved record;
BEGIN
  IF EXISTS(SELECT 1 FROM hiring_test_accounts WHERE officer_id=_officer_id) AND NOT EXISTS(
    SELECT 1 FROM hiring_test_accounts t JOIN guard_hiring_applications a ON a.id=_master_application_id
    WHERE t.officer_id=_officer_id AND a.test_run_id=t.active_run_id AND NOT a.test_archived
      AND _application_data->>'testRunId'=t.active_run_id::text
  ) THEN RAISE EXCEPTION 'Stale test application. Reload before submitting.' USING ERRCODE='40001'; END IF;
  IF auth.uid() IS NULL OR _attempt_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.officer_profiles o WHERE o.id = _officer_id AND o.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  -- Serialize concurrent sends (including lost-response retries) before any write.
  PERFORM pg_advisory_xact_lock(hashtextextended(_attempt_id::text, 0));
  SELECT * INTO receipt FROM public.hiring_submission_receipts r WHERE r.attempt_id = _attempt_id;
  IF FOUND THEN
    IF receipt.user_id <> auth.uid() OR receipt.officer_id <> _officer_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.job_applications a WHERE a.id = receipt.job_application_id AND a.job_posting_id = _job_posting_id) THEN
      RAISE EXCEPTION 'This submission attempt belongs to a different position';
    END IF;
    RETURN QUERY SELECT receipt.master_application_id, receipt.employer_application_id, receipt.job_application_id, receipt.submitted_at;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_officer_id::text, 1));
  IF NOT EXISTS (SELECT 1 FROM public.job_postings p WHERE p.id = _job_posting_id AND p.status = 'active') THEN
    RAISE EXCEPTION 'The selected position is no longer available';
  END IF;
  IF coalesce(btrim(_applicant_name),'') = '' OR coalesce(btrim(_applicant_email),'') = ''
    OR coalesce(btrim(_signature_name),'') = '' OR _signature_date IS NULL
    OR coalesce(_application_data->>'consentAccepted','false') <> 'true'
    OR coalesce(_application_data->>'signatureImage','') = ''
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['phone','address','city','state','zip','isAdult','eligibleToWork','driversLicense']) f
       WHERE coalesce(btrim(_application_data->>f),'') = '')
    OR (coalesce(btrim(_application_data->>'education'),'') = '' AND coalesce(btrim(_application_data->>'skills'),'') = '')
    OR jsonb_array_length(coalesce(_application_data#>'{availability,employmentTypes}','[]')) = 0
    OR jsonb_array_length(coalesce(_application_data#>'{availability,shiftPreferences}','[]')) = 0
    OR NOT EXISTS (SELECT 1 FROM jsonb_each(coalesce(_application_data#>'{availability,schedule}','{}')) s
       WHERE coalesce(s.value->>'start','') <> '' AND coalesce(s.value->>'end','') <> '') THEN
    RAISE EXCEPTION 'Complete the required application fields, consent, and signature before submitting';
  END IF;
  -- The nonce makes an intentional new submission distinct even if its fields
  -- are identical. Retries use the immutable receipt, never JSON equality.
  SELECT * INTO saved FROM public.submit_my_hiring_application(
    _master_application_id, _officer_id, _job_posting_id, _position, _applicant_name,
    _applicant_email, _signature_name, _signature_date,
    _application_data || jsonb_build_object('submissionAttemptId', _attempt_id)
  );
  INSERT INTO public.hiring_submission_receipts VALUES (
    _attempt_id, auth.uid(), _officer_id, saved.master_application_id,
    saved.employer_application_id, saved.job_application_id, saved.submitted_at
  );
  INSERT INTO public.hiring_submission_jobs(attempt_id, kind)
    VALUES (_attempt_id, 'archive'), (_attempt_id, 'profile_sync');
  RETURN QUERY SELECT saved.master_application_id, saved.employer_application_id, saved.job_application_id, saved.submitted_at;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_my_hiring_application_v2(uuid,uuid,uuid,uuid,text,text,text,text,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_my_hiring_application_v2(uuid,uuid,uuid,uuid,text,text,text,text,date,jsonb) TO authenticated;


CREATE FUNCTION public.record_hiring_test_exit(_user_id uuid,_expected_run_id uuid,_outcome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t hiring_test_accounts;
BEGIN
 IF NOT can_manage_hiring_test(_user_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO t FROM hiring_test_accounts WHERE user_id=_user_id FOR UPDATE;
 IF t.active_run_id<>_expected_run_id THEN RAISE EXCEPTION 'This test run has ended'; END IF;
 IF _outcome NOT IN ('Archived','Unable to verify work') THEN RAISE EXCEPTION 'Choose a supported test exit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM job_applications WHERE test_run_id=t.active_run_id AND NOT test_archived) THEN RAISE EXCEPTION 'Submit the test application first'; END IF;
 UPDATE hiring_test_runs SET outcome=_outcome WHERE id=t.active_run_id;
END $$;
REVOKE ALL ON FUNCTION public.record_hiring_test_exit(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_hiring_test_exit(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.prefill_test_onboarding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE fixtures jsonb := '{"dateOfBirth":"1990-01-01","citizenshipStatus":"U.S. citizen","filingStatus":"Single or Married filing separately","qualifyingChildren":"0","otherDependents":"0","otherCredits":"0","otherIncome":"0","deductions":"0","extraWithholding":"0","paymentMethod":"paper_check","emergencyName":"Sample Emergency Contact — Do not contact","emergencyRelationship":"Synthetic sibling","emergencyPhone":"713-555-0105","emergencySecondName":"Sample Backup Contact","emergencySecondRelationship":"Synthetic friend","emergencySecondPhone":"713-555-0106","physicianName":"Sample Physician — Do not contact","medicalNotes":"SAMPLE DATA ONLY","uniformShirt":"L","uniformPants":"34","uniformShoes":"10"}'::jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM hiring_test_accounts WHERE officer_id=NEW.officer_id) THEN
 NEW.form_data:=fixtures||coalesce((SELECT jsonb_object_agg(key,value) FROM jsonb_each(NEW.form_data) WHERE value<>'""'::jsonb),'{}')||jsonb_build_object('isTestApplication',true);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER b_prefill_test_onboarding BEFORE INSERT ON officer_onboarding_packets FOR EACH ROW EXECUTE FUNCTION prefill_test_onboarding();
UPDATE notification_workflows SET status='cancelled',next_send_at=NULL,completed_at=now() WHERE officer_id IN(SELECT officer_id FROM hiring_test_accounts) OR recipient_user_id IN(SELECT user_id FROM hiring_test_accounts);

-- Old receipts must not restore an earlier run in another browser.
CREATE OR REPLACE FUNCTION public.get_my_hiring_submission_receipt(_attempt_id uuid)
RETURNS TABLE(master_application_id uuid, employer_application_id uuid, job_application_id uuid, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.master_application_id,r.employer_application_id,r.job_application_id,r.submitted_at
 FROM hiring_submission_receipts r JOIN job_applications a ON a.id=r.job_application_id
 WHERE r.attempt_id=_attempt_id AND r.user_id=auth.uid() AND NOT a.test_archived;
$$;
UPDATE hiring_submission_jobs j SET status='complete',completed_at=now(),lease_id=null,lease_until=null,last_error='Test run archived'
WHERE j.attempt_id IN (SELECT r.attempt_id FROM hiring_submission_receipts r JOIN job_applications a ON a.id=r.job_application_id WHERE a.test_archived) AND j.status<>'complete';

-- Atomic interest updates use the active-row index while retaining all prior runs.
CREATE FUNCTION public.set_my_job_interest(_job_posting_id uuid,_officer_id uuid,_status text)
RETURNS TABLE(id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM officer_profiles o WHERE o.id=_officer_id AND o.user_id=auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF _status NOT IN ('interested','not_interested') THEN RAISE EXCEPTION 'Invalid interest status'; END IF;
 IF EXISTS(SELECT 1 FROM hiring_test_accounts WHERE officer_id=_officer_id) THEN RAISE EXCEPTION 'Submit the prefilled test application from your dashboard'; END IF;
 RETURN QUERY INSERT INTO job_applications AS a(job_posting_id,officer_id,status) VALUES(_job_posting_id,_officer_id,_status)
 ON CONFLICT(job_posting_id,officer_id) WHERE NOT test_archived DO UPDATE SET status=excluded.status RETURNING a.id;
END $$;
REVOKE ALL ON FUNCTION public.set_my_job_interest(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_job_interest(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.guard_test_document() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb:=to_jsonb(NEW);
BEGIN
 IF EXISTS(SELECT 1 FROM officer_onboarding_packets WHERE id=(r->>'packet_id')::uuid AND test_archived)
 OR EXISTS(SELECT 1 FROM guard_hiring_applications WHERE id=(r->>'hiring_application_id')::uuid AND test_archived) THEN
 RAISE EXCEPTION 'This test run has ended. Reload before uploading.' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM officer_onboarding_packets WHERE id=(r->>'packet_id')::uuid AND test_run_id IS NOT NULL) THEN
 NEW.document_label:='SAMPLE - TEST ACCOUNT - '||NEW.document_label;
 NEW.metadata:=coalesce(NEW.metadata,'{}')||'{"isTestApplication":true}'::jsonb;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_test_document BEFORE INSERT ON officer_compliance_documents FOR EACH ROW EXECUTE FUNCTION guard_test_document();
CREATE POLICY hide_archived_test_documents ON officer_compliance_documents AS RESTRICTIVE FOR SELECT TO authenticated
 USING (NOT EXISTS(SELECT 1 FROM hiring_test_accounts t WHERE t.officer_id=officer_compliance_documents.officer_id) OR EXISTS(SELECT 1 FROM officer_onboarding_packets p WHERE p.id=packet_id AND NOT p.test_archived));
