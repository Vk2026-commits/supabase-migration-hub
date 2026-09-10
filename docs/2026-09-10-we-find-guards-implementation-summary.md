# We Find Guards — Implementation Summary

**Date:** September 10, 2026  
**Repository:** `Vk2026-commits/supabase-migration-hub`  
**Production domain:** `https://wefindguards.com`  
**Supabase project:** `yatawyeamsaxemjctggp`

## Executive Summary

Today’s work completed the **company team invitation lifecycle**, **direct company onboarding safeguards**, and a new **branded workflow email notification system** for We Find Guards. The GitHub repository is current on `main`, the required Supabase database schema and Edge Functions are deployed, the account-confirmation and team-invitation templates are branded, and the new secure notification route is published on the production website.[1] [2]

The central principle of the work is that people should never be silently given access because an account or team record happens to exist. An invited team member must use a branded invitation, create a password, complete their personal contact information, and only then receive access. Officers and company users also receive branded, action-specific emails for hiring application, offer, and onboarding events. All action links are securely tied to the intended recipient and cannot be reused.

## 1. Company Team Invitation and Member Lifecycle

| Area                         | Completed behavior                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branded invitation           | A company owner or administrator can invite a new team member from the **Team** page. The email has a We Find Guards sender name, subject, visual identity, language, and action button. It does not show Supabase branding. |
| New-user invitation flow     | A new recipient receives a **Create your account** email. Selecting the link opens the We Find Guards invitation experience rather than dropping the person into the dashboard.                                              |
| Invited email address        | The recipient does **not** have to enter the email address again. The email is already tied to the invitation.                                                                                                               |
| Account setup                | The invited person creates a password and then provides their full name and mobile phone number.                                                                                                                             |
| Access activation            | Team access remains pending until the password and profile steps are finished. The person cannot use the company workspace early.                                                                                            |
| Post-activation destination  | After account setup is complete, the invited member is sent to **Browse Guards**, not the Team tab.                                                                                                                          |
| Invitation window            | After the invitation link is accepted, the person has **seven days** to finish account setup.                                                                                                                                |
| Invitation link reuse        | Invitation links are one-time. Re-opening an already accepted invitation does not create another active account setup session.                                                                                               |
| Existing active users        | A person who already has an active We Find Guards account can be added to a company team immediately, because they have already completed account creation.                                                                  |
| Delete confirmation          | Pressing the trash icon no longer deletes a team member immediately. The owner or administrator must confirm the deletion in a confirmation dialog.                                                                          |
| Re-invitation after deletion | Deleting an unactivated or test account removes its old account state. Adding the same email again creates a fresh pending invitation and sends a new branded email, rather than reactivating the old account silently.      |
| Team status display          | The Team page distinguishes active members from invitations that are still pending or awaiting account setup.                                                                                                                |

The invite email was restyled to match the live We Find Guards palette: **blue primary actions, gold accent treatment, white content surfaces, and neutral slate text**. The subject is **“You’ve been added to a We Find Guards team.”** The branding configuration now also includes the direct account confirmation email.

## 2. Direct Company Registration and Onboarding

The direct company sign-up path was audited separately from the invitation path. A company account is not permitted to bypass core contact information simply because it was created without a team invitation.

| Requirement      | Enforcement                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company name     | Required before the company hiring workspace can be used.                                                                                                           |
| Company address  | Street address, city, state, and ZIP code are required.                                                                                                             |
| Hiring contact   | Contact person name and email are required.                                                                                                                         |
| Mobile number    | The hiring contact’s mobile number is required.                                                                                                                     |
| Workspace access | Until the company profile is complete, the company is redirected to the Company Profile step instead of being allowed to use Browse Guards or the hiring workspace. |

A newly registered officer receives a branded account confirmation email and is then guided toward the hiring application. A newly registered company receives the same branded account confirmation treatment and is guided toward the company profile workflow.

## 3. Branded Account and Hiring Workflow Emails

A durable Supabase notification service was added for all requested hiring workflow events. It uses Resend for delivery, We Find Guards email HTML for presentation, Supabase database triggers for event detection, and a protected Edge Function for delivery.[3] [4]

| Event                                 | Recipient                                     | Subject / action                                                               | Delivery behavior                                                                                                                                         |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account created                       | New officer or company user                   | **Welcome to We Find Guards — confirm your account** / **Confirm my account**  | The one-time account confirmation email is sent by the hosted Auth system.                                                                                |
| Hiring application remains incomplete | Officer                                       | **Complete your We Find Guards hiring application** / **Continue application** | First reminder is sent 24 hours after the officer account is created. Follow-up emails are sent every 24 hours until the master application is submitted. |
| Hiring application is submitted       | Officer                                       | **Your hiring application has been sent** / **View application**               | Sent immediately as a submission confirmation.                                                                                                            |
| Hiring application is submitted       | Company owner and active company team members | **[Officer name] submitted a hiring application** / **Review applicant**       | Sent immediately to each authorized company recipient.                                                                                                    |
| Company sends an employment offer     | Officer                                       | **You have a new employment offer from [Company]** / **Review offer**          | Sent immediately, then every 24 hours while the offer is awaiting action.                                                                                 |
| Officer accepts an offer              | Officer                                       | **Complete your employee onboarding** / **Continue onboarding**                | Sent immediately, then every 24 hours while onboarding remains incomplete.                                                                                |
| Officer completes onboarding          | Officer                                       | **Your employee onboarding is complete** / **View onboarding status**          | Sent immediately as a completion confirmation.                                                                                                            |
| Officer completes onboarding          | Company owner and active company team members | **[Officer name] completed onboarding** / **View onboarding status**           | Sent immediately to each authorized company recipient.                                                                                                    |

The reminder process stops automatically when the underlying action is complete or no longer available. An offer reminder stops when the offer is accepted, declined, expired, withdrawn, or revised. An onboarding reminder stops when the onboarding packet is submitted. Application reminders stop when the officer submits the master hiring application.

No historical user accounts were bulk-enrolled. During verification, a legacy backfill was identified as creating 340 unsent reminders for pre-existing incomplete officer accounts. Those queued records were removed before any email was delivered. Going forward, notifications are created only for new accounts and new workflow events.

## 4. Secure Email Action Links

Every application, offer, and onboarding email now uses a secure We Find Guards action link.

| Requirement             | Implemented rule                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct destination     | Each link takes the recipient to the exact relevant area: hiring application, offer review, employee onboarding, Applicants, or Hired.                                    |
| Sign-in continuity      | If the recipient is not signed in, the link first opens We Find Guards sign-in. After successful sign-in, the recipient is returned to the intended action automatically. |
| Recipient binding       | A link can be used only by the We Find Guards account that received it. Another signed-in user cannot use it.                                                             |
| Single use              | Once selected, the link is consumed and cannot be opened again.                                                                                                           |
| Replacement links       | Each new reminder invalidates prior unused links for that same unfinished action. The newest email is always the valid one.                                               |
| Completion invalidation | The link becomes unavailable when the application, offer, or onboarding task is completed or otherwise closed.                                                            |
| Time expiration         | A link expires after seven days even if it is never selected.                                                                                                             |
| Scanner protection      | The action link does not complete an action merely by being opened by an email security scanner. It requires the intended user to sign in before it is consumed.          |

The production route `https://wefindguards.com/notification-action` was published and tested. An invalid link correctly displays the branded **Link unavailable** screen with a sign-in option rather than exposing a raw error or generic 404 page.[2]

## 5. Live Supabase Services

The following production components are live in Supabase.

| Component                                   | Status                          | Purpose                                                                                                                      |
| ------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Branded Invite user template                | Live                            | Sends We Find Guards team invitations without Supabase branding.                                                             |
| Branded Confirm signup template             | Live                            | Sends We Find Guards account confirmation messages for new direct registrations.                                             |
| `manage-company-team` Edge Function         | Live                            | Handles invitation, membership activation, confirmed deletion, and fresh re-invitation logic.                                |
| `send-workflow-notifications` Edge Function | Live                            | Creates secure action links and sends Resend transactional emails.                                                           |
| Notification database tables                | Live                            | Stores workflow state and hashed, one-time action-link records.                                                              |
| Notification database triggers              | Live                            | Detects application submission, offer status, onboarding completion, and officer account creation events.                    |
| Protected dispatcher                        | Live                            | Runs every 15 minutes to deliver due notifications and scheduled 24-hour reminders.                                          |
| Immediate dispatch request                  | Live                            | New event emails request immediate asynchronous delivery; the scheduled dispatcher remains the fallback and reminder engine. |
| Resend credential                           | Live as an Edge Function secret | Used only by the server-side notification function. It is not in GitHub source.                                              |
| Scheduler secret                            | Live as a protected secret      | Prevents public callers from using the notification dispatch endpoint.                                                       |

## 6. Validation Completed

The application build and targeted lint checks completed successfully. The new notification route was generated into the TanStack route tree. The Supabase notification function was deployed and verified as active. The required notification queue tables and database triggers were verified. The dispatcher schedule was verified as active at a 15-minute interval. The deployment test ran with no due records, so it did not deliver any test email.

The team invitation and confirmation templates were verified in hosted Supabase Auth. The public production notification-action route was verified after the Lovable publish and returns a valid branded page. The repository is clean and synchronized with `origin/main`.

## 7. GitHub Publication Record

All work was committed and pushed to the `main` branch. The principal commits are listed below.

| Commit                  | Summary                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `fb4a9ed`               | Branded company team invitation flow.                                               |
| `fb83a18` and `b8214cd` | Required account setup before company access and kept pending invitations inactive. |
| `430cf42`               | Added confirmed member deletion before re-invitation.                               |
| `67744e1`               | Required fresh account setup for re-invited members.                                |
| `581b1be`               | Extended the account-setup completion window to seven days.                         |
| `be1f47c`               | Sent activated team members to Browse Guards.                                       |
| `b51c233`               | Required invited members to provide contact details.                                |
| `06f0dfb`               | Required company contact details before the hiring workspace can be used.           |
| `bf732d1`               | Aligned the invitation email to We Find Guards blue-and-gold branding.              |
| `630ec42`               | Added secure workflow notification emails.                                          |
| `f613935`               | Added immediate event-email dispatch.                                               |
| `80e4c1b`               | Prevented unintended retroactive reminder email batches.                            |
| `2da4f1b`               | Recorded the Lovable publishing requirement and status.                             |

## 8. Security and Operating Notes

All credentials used during deployment were stored only as temporary files or protected Supabase secrets. They were removed from the sandbox after deployment and were not committed to GitHub. The Resend API key is available only to the server-side notification function. The scheduler uses a separate secret stored in Supabase Vault and sends its request to the notification function through a protected header.

Email content intentionally avoids including offer PDFs, Social Security numbers, bank information, I-9 or W-4 data, or direct links to private files. Private records remain behind the authenticated We Find Guards workspace. Emails contain only the minimum context necessary to explain the notification and provide a safe next action.

## References

[1]: https://github.com/Vk2026-commits/supabase-migration-hub "We Find Guards Supabase Migration Hub repository"
[2]: https://wefindguards.com/notification-action?token=invalid "We Find Guards secure notification action route"
[3]: https://supabase.com/docs/guides/auth/auth-email-templates "Supabase Auth email templates"
[4]: https://supabase.com/docs/guides/functions/schedule-functions "Supabase scheduled Edge Functions"
