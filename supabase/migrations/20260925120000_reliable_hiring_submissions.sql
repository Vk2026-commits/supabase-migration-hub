-- Additive v2 API: old deployed clients retain the original RPC during rollout.
CREATE TABLE public.hiring_submission_receipts (
  attempt_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  officer_id uuid NOT NULL REFERENCES public.officer_profiles(id),
  master_application_id uuid NOT NULL REFERENCES public.guard_hiring_applications(id),
  employer_application_id uuid NOT NULL UNIQUE REFERENCES public.guard_hiring_applications(id),
  job_application_id uuid NOT NULL REFERENCES public.job_applications(id),
  submitted_at timestamptz NOT NULL
);
ALTER TABLE public.hiring_submission_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hiring_submission_receipts FROM PUBLIC, anon, authenticated;

CREATE TABLE public.hiring_submission_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.hiring_submission_receipts(attempt_id),
  kind text NOT NULL CHECK (kind IN ('archive', 'profile_sync')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','complete','failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_id, kind)
);
CREATE INDEX hiring_submission_jobs_due ON public.hiring_submission_jobs(available_at)
  WHERE status IN ('pending','processing');
ALTER TABLE public.hiring_submission_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hiring_submission_jobs FROM PUBLIC, anon, authenticated;

-- Invoker-security trigger deliberately observes the *calling* DB role.
-- Only the trusted submission RPC/service may edit an already submitted master.
CREATE FUNCTION public.protect_submitted_hiring_master() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND OLD.application_type = 'master'
     AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'This application is already submitted. Use Submit to save a new revision.' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_submitted_hiring_master BEFORE UPDATE ON public.guard_hiring_applications
FOR EACH ROW EXECUTE FUNCTION public.protect_submitted_hiring_master();

-- Explicit editing keeps the last employer copy intact and saves progress in
-- the master. The receipt timestamp rejects edits from an older submission.
CREATE FUNCTION public.save_my_hiring_revision(_master_id uuid, _expected_submitted_at timestamptz, _data jsonb, _step integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.guard_hiring_applications a SET application_data = _data, current_step = greatest(0,least(9,_step))
    WHERE a.id = _master_id AND a.user_id = auth.uid() AND a.application_type = 'master'
      AND a.status = 'submitted' AND a.submitted_at = _expected_submitted_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'This application changed since you opened it. Reload before editing.' USING ERRCODE = '40001'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_my_hiring_revision(uuid,timestamptz,jsonb,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_hiring_revision(uuid,timestamptz,jsonb,integer) TO authenticated;

CREATE FUNCTION public.get_my_hiring_submission_receipt(_attempt_id uuid)
RETURNS TABLE(master_application_id uuid, employer_application_id uuid, job_application_id uuid, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.master_application_id, r.employer_application_id, r.job_application_id, r.submitted_at
  FROM public.hiring_submission_receipts r WHERE r.attempt_id = _attempt_id AND r.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_hiring_submission_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_hiring_submission_receipt(uuid) TO authenticated;

CREATE FUNCTION public.submit_my_hiring_application_v2(
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

CREATE FUNCTION public.claim_hiring_submission_job()
RETURNS TABLE(id uuid, lease_id uuid, kind text, employer_application_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job public.hiring_submission_jobs;
BEGIN
  UPDATE public.hiring_submission_jobs SET status = 'failed', last_error = 'Worker lease expired after final attempt'
    WHERE status = 'processing' AND lease_until < now() AND attempts >= 5;
  SELECT * INTO job FROM public.hiring_submission_jobs j
    WHERE j.attempts < 5 AND ((j.status = 'pending' AND j.available_at <= now())
      OR (j.status = 'processing' AND j.lease_until < now()))
    ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.hiring_submission_jobs j SET status = 'processing', attempts = j.attempts + 1,
    lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes'
    WHERE j.id = job.id RETURNING * INTO job;
  RETURN QUERY SELECT job.id, job.lease_id, job.kind, r.employer_application_id
    FROM public.hiring_submission_receipts r WHERE r.attempt_id = job.attempt_id;
END;
$$;

CREATE FUNCTION public.finish_hiring_submission_job(_id uuid, _lease_id uuid, _error text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.hiring_submission_jobs SET
    status = CASE WHEN _error IS NULL THEN 'complete' WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
    last_error = left(_error, 1000), completed_at = CASE WHEN _error IS NULL THEN now() END,
    available_at = now() + make_interval(secs => (30 * power(2, attempts))::integer),
    lease_until = NULL, lease_id = NULL
  WHERE id = _id AND lease_id = _lease_id AND status = 'processing';
$$;

-- All profile/work-history writes and completion commit together. A crashed
-- worker cannot create duplicate work-history entries when the lease is retried.
CREATE FUNCTION public.sync_hiring_submission_profile(_id uuid, _lease_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job public.hiring_submission_jobs; receipt public.hiring_submission_receipts;
  snapshot jsonb; item jsonb; work_id uuid;
BEGIN
  SELECT * INTO job FROM public.hiring_submission_jobs j WHERE j.id = _id AND j.lease_id = _lease_id
    AND j.status = 'processing' AND j.kind = 'profile_sync' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker lease is no longer valid'; END IF;
  SELECT * INTO receipt FROM public.hiring_submission_receipts r WHERE r.attempt_id = job.attempt_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(receipt.officer_id::text, 1));
  -- Never let an older queued submission replace a more recent submission.
  IF EXISTS (SELECT 1 FROM public.hiring_submission_receipts r WHERE r.officer_id = receipt.officer_id
      AND r.submitted_at > receipt.submitted_at) THEN
    PERFORM public.finish_hiring_submission_job(_id, _lease_id); RETURN;
  END IF;
  SELECT a.application_data INTO snapshot FROM public.guard_hiring_applications a WHERE a.id = receipt.employer_application_id;
  UPDATE public.profiles SET full_name = snapshot->>'applicantName' WHERE id = receipt.user_id;
  UPDATE public.officer_profiles SET phone = snapshot->>'phone', address_street = snapshot->>'address',
    address_city = snapshot->>'city', address_state = snapshot->>'state', address_zip = snapshot->>'zip',
    employment_type = ARRAY(SELECT jsonb_array_elements_text(snapshot#>'{availability,employmentTypes}')),
    shift_preference = ARRAY(SELECT jsonb_array_elements_text(snapshot#>'{availability,shiftPreferences}')),
    availability_schedule = snapshot#>'{availability,schedule}'
    WHERE id = receipt.officer_id AND user_id = receipt.user_id;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(snapshot->'workHistory','[]')) LOOP
    IF coalesce(btrim(item->>'employer'),'') = '' THEN CONTINUE; END IF;
    work_id := NULL;
    SELECT w.id INTO work_id FROM public.work_history w WHERE w.officer_id = receipt.officer_id
      AND (w.id::text = item->>'id' OR (w.company_name = item->>'employer'
        AND w.position_title IS NOT DISTINCT FROM nullif(item->>'title','')
        AND w.start_date IS NOT DISTINCT FROM nullif(item->>'startDate','')::date)) LIMIT 1;
    IF work_id IS NULL THEN
      INSERT INTO public.work_history(officer_id,company_name) VALUES(receipt.officer_id,item->>'employer') RETURNING id INTO work_id;
    END IF;
    UPDATE public.work_history SET company_name = item->>'employer', position_title = nullif(item->>'title',''),
      start_date = nullif(item->>'startDate','')::date, end_date = nullif(item->>'endDate','')::date,
      supervisor_name = nullif(item->>'supervisor',''), supervisor_phone = nullif(item->>'phone',''),
      reason_for_leaving = nullif(item->>'reason','') WHERE id = work_id AND officer_id = receipt.officer_id;
  END LOOP;
  PERFORM public.finish_hiring_submission_job(_id, _lease_id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_hiring_submission_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_hiring_submission_job(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_hiring_submission_profile(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_hiring_submission_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_hiring_submission_job(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_hiring_submission_profile(uuid,uuid) TO service_role;

CREATE FUNCTION public.dispatch_hiring_submission_jobs() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE project_url text; publishable_key text; scheduler_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.hiring_submission_jobs WHERE status IN ('pending','processing')) THEN RETURN; END IF;
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'notification_project_url';
  SELECT decrypted_secret INTO publishable_key FROM vault.decrypted_secrets WHERE name = 'notification_publishable_key';
  SELECT decrypted_secret INTO scheduler_secret FROM vault.decrypted_secrets WHERE name = 'notification_cron_secret';
  IF coalesce(project_url,'') = '' OR coalesce(publishable_key,'') = '' OR coalesce(scheduler_secret,'') = '' THEN
    RAISE WARNING 'Hiring submission dispatcher requires notification scheduler Vault secrets'; RETURN;
  END IF;
  PERFORM net.http_post(url := rtrim(project_url,'/') || '/functions/v1/process-hiring-submissions',
    headers := jsonb_build_object('Content-Type','application/json','apikey',publishable_key,'x-notification-cron',scheduler_secret),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_hiring_submission_jobs() FROM PUBLIC;
SELECT cron.schedule('process-hiring-submissions', '* * * * *', $$SELECT public.dispatch_hiring_submission_jobs();$$);
NOTIFY pgrst, 'reload schema';
