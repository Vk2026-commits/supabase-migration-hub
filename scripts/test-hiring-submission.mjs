import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const helper = ts.transpileModule(readFileSync('src/lib/hiringSubmission.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { withDeadline, submitWithReceipt, submissionAttemptKey } = await import(`data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`);
const receipt = { master_application_id: 'master', employer_application_id: 'copy' };
assert.equal(await submitWithReceipt(async () => receipt, async () => { throw Error('should not look up'); }), receipt);
assert.equal(await submitWithReceipt(async () => { throw Error('lost response'); }, async () => receipt), receipt);
await assert.rejects(submitWithReceipt(async () => { throw Error('failed'); }, async () => null), /failed/);
await assert.rejects(withDeadline(new Promise(() => {}), 5), /not yet been confirmed/);
assert.notEqual(submissionAttemptKey('a', 'b', 'c'), submissionAttemptKey('x', 'b', 'c'));
console.log('PASS client receipt reconciliation, timeout, and account isolation');

if (!process.env.PGLITE_MODULE) {
  console.log('Database tests require PGLITE_MODULE pointing to @electric-sql/pglite.');
  process.exit(0);
}
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
await db.exec(`
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE SCHEMA net; CREATE SCHEMA cron;
CREATE TABLE auth.users(id uuid primary key);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
CREATE TABLE public.profiles(id uuid primary key,full_name text);
CREATE TABLE public.officer_profiles(id uuid primary key,user_id uuid,phone text,address_street text,address_city text,address_state text,address_zip text,employment_type text[],shift_preference text[],availability_schedule jsonb);
CREATE TABLE public.company_profiles(id uuid primary key,company_name text);
CREATE TABLE public.job_postings(id uuid primary key,company_id uuid,title text,status text);
CREATE TABLE public.job_applications(id uuid primary key default gen_random_uuid(),job_posting_id uuid,officer_id uuid,status text,unique(job_posting_id,officer_id));
CREATE TABLE public.guard_hiring_applications(id uuid primary key default gen_random_uuid(),officer_id uuid,user_id uuid,application_type text,source_application_id uuid,job_application_id uuid,company_name text,position text,applicant_name text,applicant_email text,status text,current_step integer,signature_name text,signature_date date,submitted_at timestamptz,application_data jsonb,evidence_snapshot_status text,evidence_snapshot_kind text,created_at timestamptz default now(),updated_at timestamptz default now());
CREATE TABLE public.work_history(id uuid primary key default gen_random_uuid(),officer_id uuid,company_name text,position_title text,start_date date,end_date date,supervisor_name text,supervisor_phone text,reason_for_leaving text);
GRANT SELECT,UPDATE ON guard_hiring_applications TO authenticated;
`);
await db.exec(readFileSync('supabase/migrations/20260924213000_submit_hiring_application_transaction.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20260925120000_reliable_hiring_submissions.sql', 'utf8'));
const user = '00000000-0000-4000-8000-000000000001';
const officer = '00000000-0000-4000-8000-000000000002';
const company = '00000000-0000-4000-8000-000000000003';
const job = '00000000-0000-4000-8000-000000000004';
const attempt = '00000000-0000-4000-8000-000000000005';
await db.exec(`INSERT INTO auth.users VALUES('${user}'); INSERT INTO profiles VALUES('${user}','Test'); INSERT INTO officer_profiles(id,user_id) VALUES('${officer}','${user}'); INSERT INTO company_profiles VALUES('${company}','Test Company'); INSERT INTO job_postings VALUES('${job}','${company}','Officer','active'); SET test.actor = '${user}';`);
const data = { applicantName: 'Test Applicant', consentAccepted: true, signatureImage: 'test-only', phone:'1234567890',address:'Test',city:'Test',state:'TX',zip:'12345',isAdult:'Yes',eligibleToWork:'Yes',driversLicense:'Yes',education:'Test',availability:{employmentTypes:['full-time'],shiftPreferences:['day'],schedule:{Monday:{start:'09:00',end:'17:00'}}},workHistory:[{employer:'Test Employer',title:'Officer',startDate:'2020-01-01'}] };
const submit = async (id, body = data) => (await db.query(`SELECT * FROM submit_my_hiring_application_v2($1,NULL,$2,$3,'Officer','Test Applicant','test@example.invalid','Test Applicant','2026-09-25',$4::jsonb)`, [id,officer,job,JSON.stringify(body)])).rows[0];
await assert.rejects(submit(attempt, {...data,consentAccepted:false}), /required/);
await db.exec('SET ROLE authenticated');
const first = await submit(attempt);
const duplicate = await submit(attempt);
assert.deepEqual(first,duplicate);
await assert.rejects(db.query(`UPDATE guard_hiring_applications SET status='draft' WHERE id=$1`,[first.master_application_id]), /already submitted/);
await db.exec('RESET ROLE');
await db.query(`UPDATE guard_hiring_applications SET application_data=application_data || '{"attachmentManifest":[]}'::jsonb,status='reviewed' WHERE id=$1`,[first.employer_application_id]);
assert.deepEqual(await submit(attempt), first);
assert.equal((await db.query(`SELECT count(*)::int n FROM guard_hiring_applications WHERE application_type='employer_copy'`)).rows[0].n,1);
const second = await submit('00000000-0000-4000-8000-000000000006');
assert.notEqual(first.employer_application_id,second.employer_application_id);
await assert.rejects(db.query(`SELECT save_my_hiring_revision($1,$2,'{}',1)`,[first.master_application_id,first.submitted_at]), /changed/);
await db.exec(`SET test.actor = '00000000-0000-4000-8000-000000000099'`);
assert.equal((await db.query(`SELECT * FROM get_my_hiring_submission_receipt($1)`,[attempt])).rows.length,0);
await assert.rejects(submit(attempt), /Not authorized/);
await db.exec(`SET test.actor = '${user}'`);
// An expired lease is reclaimable; a stale worker cannot finish a newer lease.
let claimed = (await db.query('SELECT * FROM claim_hiring_submission_job()')).rows[0];
await db.query(`UPDATE hiring_submission_jobs SET lease_until=now()-interval '1 minute',created_at=now()-interval '1 day' WHERE id=$1`,[claimed.id]);
const reclaimed = (await db.query('SELECT * FROM claim_hiring_submission_job()')).rows[0];
assert.equal(reclaimed.id,claimed.id);
assert.notEqual(reclaimed.lease_id,claimed.lease_id);
await db.query(`SELECT finish_hiring_submission_job($1,$2)`,[claimed.id,claimed.lease_id]);
assert.equal((await db.query(`SELECT status FROM hiring_submission_jobs WHERE id=$1`,[claimed.id])).rows[0].status,'processing');
await db.query(`SELECT finish_hiring_submission_job($1,$2)`,[reclaimed.id,reclaimed.lease_id]);
while ((claimed = (await db.query('SELECT * FROM claim_hiring_submission_job()')).rows[0])) {
  if (claimed.kind === 'profile_sync') await db.query('SELECT sync_hiring_submission_profile($1,$2)',[claimed.id,claimed.lease_id]);
  else await db.query('SELECT finish_hiring_submission_job($1,$2)',[claimed.id,claimed.lease_id]);
}
assert.equal((await db.query('SELECT count(*)::int n FROM work_history')).rows[0].n,1);
assert.equal((await db.query('SELECT count(*)::int n FROM hiring_submission_jobs WHERE status=\'complete\'')).rows[0].n,4);
// Retry backoff and the hard five-attempt limit, including a crash on the last.
await db.query(`UPDATE hiring_submission_jobs SET status='pending',attempts=4,available_at=now(),completed_at=NULL WHERE id=$1`,[reclaimed.id]);
const lastAttempt = (await db.query('SELECT * FROM claim_hiring_submission_job()')).rows[0];
await db.query(`SELECT finish_hiring_submission_job($1,$2,'simulated failure')`,[lastAttempt.id,lastAttempt.lease_id]);
assert.equal((await db.query(`SELECT status FROM hiring_submission_jobs WHERE id=$1`,[lastAttempt.id])).rows[0].status,'failed');
assert.equal((await db.query('SELECT * FROM claim_hiring_submission_job()')).rows.length,0);
await db.query(`UPDATE job_postings SET status='closed' WHERE id=$1`,[job]);
assert.deepEqual(await submit(attempt),first); // Existing receipt still works after closure.
await assert.rejects(submit('00000000-0000-4000-8000-000000000007'),/no longer available/);
console.log('PASS migration execution, validation, permissions, receipt retries, archive mutation, intentional resubmission, stale draft/revision protection, worker leases, and transactional profile sync');
await db.close();
