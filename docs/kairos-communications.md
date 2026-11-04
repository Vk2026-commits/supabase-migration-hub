# Kairos communications

Company: abaebf12-8db2-44f7-b60e-a8931405df88.

The sidebar provides Call Log, SMS Log, and Analytics. Owners, active administrators,
and hiring managers can read logs and fetch transcript/recording details. RLS isolates
stored metadata; the detail/sync function independently verifies the user and company.
Officer accounts and reviewers cannot read these communications.

Retell credentials live in KAIROS_RETELL_API_KEY function secrets. Calls are limited to
Kairos agents agent_8947865df608da57d4ff7c8375 and agent_e4c3a2078ca7f5adc0d26fd0e1.
SMS conversations must be sms_chat and involve Kairos numbers +17135613537 or +16416098811.
Retell reported no SMS agents assigned or chat history at deployment. These screens do
not send calls, SMS, or email, and do not provision SMS service.

Retell's existing webhook still targets Vektiss Voice project hygmztvpmmyxuomjwrbt,
function retell-webhook. Its verified handler mirrors only Kairos events asynchronously
to company-communications with WFG_RETELL_BRIDGE_SECRET, with three attempts. Original
Vektiss persistence and notifications are unchanged. The We Find Guards receiver fetches
canonical provider state before upsert, preventing stale webhook replay overwrites.
This source deployment was patched from its deployed source map; retain that mirror
when updating the Vektiss Voice repository/deployment.

Both projects store the bridge secret as a function secret. We Find Guards additionally
stores it in Vault as wfg_retell_bridge for the five-minute recovery sync (latest 500
calls and chats). Manual Sync now exhausts pagination to recover older records.
Rotate all three copies together. Do not expose credentials in browser bundles.

Transcript and recording URLs are fetched on demand from Retell and are not persisted
in the log table. Provider retention/deletion can make these unavailable.

Verification: scripts/test-company-communications.mjs mocks transport and checks auth,
roles, company mismatch, unsigned webhooks, and foreign agent exclusion. Live RLS tests
confirmed owner access and zero rows for an unrelated authenticated user. No calls or
messages were sent during implementation.

## Job inquiry greeting and application emails

Kairos front desk and HR inbound phone bindings now use agent version 16, based on their previously live versions (front desk 13, HR 11). Existing voice, transfers and webhook settings are preserved. Maya adds a spoken “say job” cue and routes job inquiries to HR.

HR confirms the applicant's name/email, then calls `retell-application-email`. The email contains only the current application URL, `https://wefindguards.com/get-started`, and directs the recipient to create/sign into an officer account and apply for Kairos. This tool replaces the former Railway email webhook for these inbound calls. The old Railway service itself is not modified.

The function requires the server-managed `KAIROS_APPLICATION_EMAIL_SECRET` tool header, verifies the current call belongs to the Kairos HR agent through Retell, rejects calls older than 12 hours, and uses Resend's 24-hour idempotency key per call/email to prevent retry duplicates. `KAIROS_RETELL_API_KEY` and `RESEND_API_KEY` remain server-only. HR only reports success after the provider accepts the message; acceptance does not guarantee inbox delivery.

Validation: `node scripts/test-retell-application-email.mjs` mocks all transport and covers unauthorized requests, malformed email, other agents, old calls, retries, the current URL and email-provider failures. No real caller email or phone call was sent during deployment. A real phone/inbox test remains a manual verification step.
