-- Run after the employee invitation migration, with test.company_id configured.
-- No email provider is called. All synthetic fixtures are rolled back.
BEGIN;
DO $$
DECLARE company uuid:=current_setting('test.company_id')::uuid;
owner_id uuid; person uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
employee uuid:=gen_random_uuid(); request uuid:=gen_random_uuid(); result jsonb; officer uuid;
BEGIN
 SELECT user_id INTO owner_id FROM company_profiles WHERE id=company;
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 VALUES(person,'employee-invite-test@example.invalid',now(),'{"full_name":"Synthetic Employee","role":"officer"}'),
 (stranger,'employee-invite-other@example.invalid',now(),'{"full_name":"Synthetic Other","role":"officer"}');
 SELECT id INTO officer FROM officer_profiles WHERE user_id=person;
 IF officer IS NULL THEN INSERT INTO officer_profiles(user_id) VALUES(person) RETURNING id INTO officer; END IF;
 INSERT INTO company_employee_imports(id,company_id,source_key,first_name,last_name,email,phone)
 VALUES(employee,company,'rollback-invitation-test','Synthetic','Employee','employee-invite-test@example.invalid','713-555-0199');
 PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
 BEGIN PERFORM reserve_employee_invitation(request,employee,encode(extensions.digest('employee-token','sha256'),'hex')); RAISE EXCEPTION 'FAIL unauthorized reservation'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 result:=reserve_employee_invitation(request,employee,encode(extensions.digest('employee-token','sha256'),'hex'));
 ASSERT result->>'created'='true','reservation missing';
 result:=reserve_employee_invitation(request,employee,encode(extensions.digest('different','sha256'),'hex'));
 ASSERT result->>'created'='false','request replay created duplicate';
 BEGIN PERFORM reserve_employee_invitation(gen_random_uuid(),employee,encode(extensions.digest('duplicate','sha256'),'hex')); RAISE EXCEPTION 'FAIL pending delivery resend'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',stranger::text,true);
 BEGIN PERFORM claim_employee_invitation('employee-token',false); RAISE EXCEPTION 'FAIL wrong account preview'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',person::text,true);
 UPDATE auth.users SET email_confirmed_at=null WHERE id=person;
 BEGIN PERFORM claim_employee_invitation('employee-token',false); RAISE EXCEPTION 'FAIL unverified preview'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 UPDATE auth.users SET email_confirmed_at=now() WHERE id=person;
 result:=claim_employee_invitation('employee-token',false);
 ASSERT result->>'employee_id'=employee::text,'matching preview missing';
 ASSERT (SELECT linked_user_id IS NULL FROM company_employee_imports WHERE id=employee),'preview mutated record';
 UPDATE employee_record_invitations SET expires_at=now()-interval '1 minute',email_status='failed' WHERE id=request;
 BEGIN PERFORM claim_employee_invitation('employee-token',true); RAISE EXCEPTION 'FAIL expired claim'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 result:=reserve_employee_invitation(gen_random_uuid(),employee,encode(extensions.digest('replacement','sha256'),'hex'));
 PERFORM set_config('request.jwt.claim.sub',person::text,true);
 BEGIN PERFORM claim_employee_invitation('employee-token',true); RAISE EXCEPTION 'FAIL revoked claim'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 result:=claim_employee_invitation('replacement',true);
 ASSERT (SELECT linked_user_id=person AND linked_officer_id=officer AND status='claimed' FROM company_employee_imports WHERE id=employee),'link not saved';
 PERFORM propose_employee_hire_date(employee,current_date-365);
 ASSERT (SELECT hire_date IS NULL AND proposed_hire_date=current_date-365 FROM company_employee_imports WHERE id=employee),'proposal became official without review';
 BEGIN PERFORM review_employee_hire_date(employee,current_date-365,true); RAISE EXCEPTION 'FAIL employee approved own date'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 BEGIN PERFORM propose_employee_hire_date(employee,current_date+1); RAISE EXCEPTION 'FAIL future hire date'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 BEGIN PERFORM review_employee_hire_date(employee,current_date-364,true); RAISE EXCEPTION 'FAIL stale proposal approved'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM review_employee_hire_date(employee,current_date-365,true);
 ASSERT (SELECT hire_date=current_date-365 AND hire_date_reviewed_by=owner_id FROM company_employee_imports WHERE id=employee),'staff approval not saved';
 PERFORM set_config('request.jwt.claim.sub',person::text,true);
 BEGIN PERFORM propose_employee_hire_date(employee,current_date-100); RAISE EXCEPTION 'FAIL overwrote official hire date'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 UPDATE company_employee_imports SET status='complete' WHERE id=employee;
 result:=claim_employee_invitation('replacement',true);
 ASSERT (SELECT status='complete' FROM company_employee_imports WHERE id=employee),'replay reset progress';
 UPDATE company_employee_imports SET invitation_excluded=true WHERE id=employee;
 BEGIN PERFORM claim_employee_invitation('replacement',false); RAISE EXCEPTION 'FAIL excluded claim'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 BEGIN PERFORM reserve_employee_invitation(gen_random_uuid(),employee,encode(extensions.digest('excluded','sha256'),'hex')); RAISE EXCEPTION 'FAIL excluded invitation'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
SELECT 'PASS: permissions, verified email, preview, replay, pending delivery, expiry, revocation, exclusion, and preserved completion. No emails; fixtures rolled back.' AS result;
