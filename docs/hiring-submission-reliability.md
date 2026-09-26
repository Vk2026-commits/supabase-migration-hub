# Hiring submission reliability

## Release order

1. Deploy `archive-application-evidence` and `process-hiring-submissions`.
2. Apply `20260925120000_reliable_hiring_submissions.sql`.
3. Confirm the `process-hiring-submissions` cron job is active and the schema cache exposes the v2 RPC and receipt lookup.
4. Publish the frontend. The original submission RPC remains for already-open/older clients during rollout.

The worker reuses `NOTIFICATION_CRON_SECRET` and the existing Vault entries
`notification_project_url`, `notification_publishable_key`, and
`notification_cron_secret`. Missing configuration must be repaired before publishing.
The worker is scheduler-only; no browser may claim or complete jobs.

## Behavior

- A browser stores only an opaque attempt ID scoped to user, officer, and job.
- The receipt, employer copy, and two background jobs commit in one transaction.
- Ordinary draft writes cannot modify submitted masters. Explicit edits use a
  receipt timestamp to reject stale writes while retaining editing progress.
- Retrying returns the immutable receipt even after archiving or company review.
  Choosing Edit Application starts a new intentional attempt.
- Jobs have five-minute leases and five attempts, with exponential retry delays.
  Profile synchronization and its completion are transactional. Older submissions
  cannot overwrite a newer submission's profile data.
- Archive failures do not undo submission, but remain visible as failed jobs.
  Archiving never changes company review/hiring status. Optional uploads are not
  required for submission; a failed copy of an existing upload is retried.

## Checks

Run `npm run test:hiring-submission` for client receipt/deadline tests. To also run
the isolated PostgreSQL integration fixture, set `PGLITE_MODULE` to an installed
`@electric-sql/pglite` module entry point before running the same script. The test
creates only an in-memory database; it never uses applicant data or production credentials.

Run the production build, TypeScript check, migration dry run, and linked database
lint. Existing unrelated lint failures must be distinguished from new failures.
Use a designated test account for browser/network-interruption acceptance testing.

Monitor queue health without selecting application contents:

```sql
select kind, status, count(*), min(created_at) as oldest
from public.hiring_submission_jobs group by kind, status;
select jobname, active from cron.job where jobname = 'process-hiring-submissions';
```

Investigate failed jobs and scheduler failures. After fixing the cause, an
authorized operator may reset a specific failed job to pending (attempts 0,
available_at now, lease cleared). Do not mass-replay completed submissions.
Disk IO pressure may still cause timeouts; this change does not increase compute
capacity or guarantee that every database request will meet its deadline.
