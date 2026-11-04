-- Set test.company_id to a company with an active job before running.
-- Synthetic fixtures are fully rolled back. No email services are invoked.
BEGIN;
DO $$
DECLARE company uuid:=current_setting('test.company_id')::uuid; owner_id uuid; job_id uuid; legacy_id uuid:=gen_random_uuid(); applicant uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); result jsonb; master_id uuid; n int;
BEGIN
 SELECT user_id INTO owner_id FROM company_profiles WHERE id=company;
 SELECT id INTO job_id FROM job_postings WHERE company_id=company AND status='active' LIMIT 1;
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES(applicant,'legacy-test@example.invalid',now(),'{"full_name":"Synthetic Legacy Test","role":"officer"}');
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES(other_user,'legacy-other@example.invalid',now(),'{"full_name":"Synthetic Other","role":"officer"}');
 INSERT INTO company_legacy_applications(id,company_id,source,source_id,source_submitted_at,import_batch,applicant_name,email,application_data)
 VALUES(legacy_id,company,'synthetic','test',now()-interval '30 days','rollback-test','Synthetic Legacy Test','legacy-test@example.invalid','{}');
 PERFORM set_config('request.jwt.claim.sub',applicant::text,true);
 BEGIN PERFORM reserve_legacy_invitation(request_id,legacy_id,job_id,encode(extensions.digest('test-token','sha256'),'hex')); RAISE EXCEPTION 'FAIL applicant could invite'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 result:=reserve_legacy_invitation(request_id,legacy_id,job_id,encode(extensions.digest('test-token','sha256'),'hex'));
 ASSERT result->>'created'='true','reservation failed';
 result:=reserve_legacy_invitation(request_id,legacy_id,job_id,encode(extensions.digest('other-token','sha256'),'hex'));
 ASSERT result->>'created'='false','repeat send not idempotent';
 PERFORM set_config('request.jwt.claim.sub',other_user::text,true);
 BEGIN PERFORM claim_legacy_invitation('test-token',false,'{}'); RAISE EXCEPTION 'FAIL wrong account could claim'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',applicant::text,true);
 result:=claim_legacy_invitation('test-token',false,'{}');
 ASSERT result#>>'{legacy,id}'=legacy_id::text,'preview failed';
 result:=claim_legacy_invitation('test-token',true,'{"applicantName":"Synthetic Legacy Test","phone":"713-555-0199","signature":"old","signatureImage":"old","ssn":"DO-NOT-STORE","consentAccepted":true}');
 SELECT master_application_id INTO master_id FROM legacy_applicant_invitations WHERE id=request_id;
 ASSERT master_id IS NOT NULL,'draft not created';
 ASSERT (SELECT application_data->>'phone'='713-555-0199' AND application_data->>'signature'='' AND application_data->>'signatureImage'='' AND NOT application_data ? 'ssn' AND application_data->>'consentAccepted'='false' FROM guard_hiring_applications WHERE id=master_id),'unsafe prefill';
 UPDATE guard_hiring_applications SET application_data=jsonb_set(application_data,'{phone}','"713-555-0101"') WHERE id=master_id;
 result:=claim_legacy_invitation('test-token',true,'{"phone":"713-555-0199"}');
 ASSERT (SELECT application_data->>'phone'='713-555-0101' FROM guard_hiring_applications WHERE id=master_id),'repeat claim overwrote edits';
 SELECT count(*) INTO n FROM guard_hiring_applications WHERE user_id=applicant AND application_type='master';
 ASSERT n=1,'duplicate drafts';
 -- A different pending invitation expires and requires a new token.
 UPDATE legacy_applicant_invitations SET claimed_at=null,claimed_by=null,expires_at=now()-interval '1 minute' WHERE id=request_id;
 BEGIN PERFORM claim_legacy_invitation('test-token',false,'{}'); RAISE EXCEPTION 'FAIL expired token accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 UPDATE legacy_applicant_invitations SET email_status='failed' WHERE id=request_id;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 result:=reserve_legacy_invitation(gen_random_uuid(),legacy_id,job_id,encode(extensions.digest('replacement','sha256'),'hex'));
 PERFORM set_config('request.jwt.claim.sub',applicant::text,true);
 BEGIN PERFORM claim_legacy_invitation('test-token',false,'{}'); RAISE EXCEPTION 'FAIL revoked token accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 result:=claim_legacy_invitation('replacement',true,'{"phone":"713-555-0199"}');
 ASSERT (SELECT application_data->>'phone'='713-555-0101' FROM guard_hiring_applications WHERE id=master_id),'draft was overwritten';
 -- Confirm an employer copy records both dates and retains the selected job link.
 INSERT INTO job_applications(job_posting_id,officer_id,status)
 SELECT job_id,officer_id,'interview_scheduled' FROM guard_hiring_applications WHERE id=master_id;
 INSERT INTO guard_hiring_applications(user_id,officer_id,application_type,status,company_name,position,applicant_name,applicant_email,job_application_id,submitted_at,application_data)
 SELECT applicant,m.officer_id,'employer_copy','submitted','Synthetic','Officer','Synthetic','legacy-test@example.invalid',j.id,now(),'{}'
 FROM guard_hiring_applications m JOIN job_applications j ON j.officer_id=m.officer_id AND j.job_posting_id=job_id WHERE m.id=master_id;
 ASSERT (SELECT count(*)=1 FROM guard_hiring_applications WHERE user_id=applicant AND application_type='employer_copy' AND legacy_original_submitted_at IS NOT NULL),'original date missing';
 ASSERT (SELECT count(*)=1 FROM legacy_applicant_invitations WHERE claimed_by=applicant AND revoked_at IS NULL AND confirmed_at IS NOT NULL),'confirmation missing';
 result:=claim_legacy_invitation('replacement',true,'{}');
 ASSERT result->>'existing_application'='true','existing application not recognized';
 ASSERT (SELECT j.status='interview_scheduled' FROM job_applications j JOIN guard_hiring_applications m ON m.officer_id=j.officer_id WHERE m.id=master_id AND j.job_posting_id=job_id),'hiring stage reset';
 UPDATE auth.users SET email_confirmed_at=null WHERE id=applicant;
 BEGIN PERFORM claim_legacy_invitation('replacement',false,'{}'); RAISE EXCEPTION 'FAIL unverified email accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;

END $$;
ROLLBACK;
SELECT 'PASS: invitation permissions, verified identity, prefill, sensitive-field exclusion, replay, expiry, resend and draft preservation, confirmation timestamps, existing hiring stage and unverified email. Rolled back all fixtures.' result;
