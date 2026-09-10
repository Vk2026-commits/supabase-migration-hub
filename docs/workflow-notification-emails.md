# We Find Guards Workflow Notification Emails

## Purpose

This notification system delivers **We Find Guards-branded transactional emails** for account confirmation, hiring applications, employment offers, and employee onboarding. Every notification contains a secure, account-specific action link. The link opens the exact relevant area after the recipient signs in; it never exposes application, offer, payroll, or identity information in the email itself.

## Recipient journeys and approved language

| Event                                             | Recipient                                     | Subject                                              | Primary action             | Reminder behavior                                                                                                             |
| ------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A new account is created                          | New officer or company                        | **Welcome to We Find Guards — confirm your account** | **Confirm my account**     | Supabase confirmation link is one-time. No reminder is sent by this workflow.                                                 |
| An officer has not completed a hiring application | Officer                                       | **Complete your We Find Guards hiring application**  | **Continue application**   | First reminder is sent 24 hours after account creation, then every 24 hours until the master application is submitted.        |
| An officer submits an application to a company    | Officer                                       | **Your hiring application has been sent**            | **View application**       | One confirmation email.                                                                                                       |
| An officer submits an application to a company    | Company owner and active company team members | **[Officer name] submitted a hiring application**    | **Review applicant**       | One notification email per recipient.                                                                                         |
| A company sends an employment offer               | Officer                                       | **You have a new employment offer from [Company]**   | **Review offer**           | Sent immediately, then every 24 hours until the officer accepts, declines, or the offer expires, is withdrawn, or is revised. |
| An officer accepts an offer                       | Officer                                       | **Complete your employee onboarding**                | **Continue onboarding**    | Sent immediately, then every 24 hours until the onboarding packet is submitted.                                               |
| An officer submits onboarding                     | Officer                                       | **Your employee onboarding is complete**             | **View onboarding status** | One confirmation email.                                                                                                       |
| An officer submits onboarding                     | Company owner and active company team members | **[Officer name] completed onboarding**              | **View onboarding status** | One notification email per recipient.                                                                                         |

## Secure-link lifecycle

Each application, offer, and onboarding link is specific to the recipient and expires at the first of the following events:

1. The recipient uses the link. A used link cannot be opened again.
2. A newer notification for the same unfinished action is sent. The newer email replaces every earlier link for that action.
3. The recipient completes the action, or the action becomes unavailable. For example, an offer is accepted, declined, expired, withdrawn, or revised.
4. Seven days pass without use.

A person who is not signed in is taken to **We Find Guards sign in** first. After successful sign-in, the original secure link is resolved and the person is sent to the appropriate application, offer, onboarding, Applicants, or Hired page. A secure link cannot be used by any other account.

## Security and delivery rules

Notification content is intentionally limited to status, company name, position, and next action. It does not include the employment-offer PDF, personal identifiers, bank details, government-form answers, or direct links to private files. Sensitive documents remain behind the authenticated We Find Guards workspace.

The database queues notifications at the event that changes workflow state. A protected dispatcher runs every 15 minutes and only sends an email when its scheduled send time is due. Reminder records are rescheduled exactly 24 hours after successful delivery and immediately stop when completion is recorded.

## Deployment

The schema migration creates the queue, one-time link registry, and database triggers. The deployment script securely stores the scheduler values in Supabase Vault, sets the Resend key and scheduler secret in Edge Function secrets, deploys the notification function, and schedules the dispatcher.

```sh
cd supabase-migration-hub
export SUPABASE_ACCESS_TOKEN="<Supabase personal access token>"
export RESEND_API_KEY="<Resend API key>"
export SUPABASE_ANON_KEY="<Supabase publishable key>"
./scripts/setup-workflow-notifications.sh
```

The script does not save any supplied credential in Git. Do not paste credentials into source files, database migrations, or support tickets.
