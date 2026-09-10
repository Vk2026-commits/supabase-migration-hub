# We Find Guards Team Invitation Branding

## Purpose

This implementation gives a newly invited company team member a **We Find Guards-branded, single-use invitation email** and directs the recipient to a branded account-activation page. The email does not name or link to Supabase. Rather than sending the recipient into a protected dashboard, the link securely verifies the invitation, opens a first-password screen, requires the recipient’s name and phone number, and then sends the recipient to **Browse Guards**.

The code changes are intentionally split between the application and hosted Supabase configuration. The application controls the invitation destination and the in-app activation experience. The hosted Auth project controls the sender identity and the actual email template delivered to recipients.

## Invitation Journey

| Step | Behavior                                                                                       | Location                                                           |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | A company owner or administrator adds a new email address in **Company team**.                 | `manage-company-team` Edge Function                                |
| 2    | Supabase creates an invite-only account and sends the **Invite user** email.                   | Hosted Supabase Auth                                               |
| 3    | The recipient selects **Create your account** in the We Find Guards email.                     | `supabase/templates/invite.html`                                   |
| 4    | The public app verifies the one-time invitation token and establishes the recipient’s session. | `/accept-team-invitation`                                          |
| 5    | The recipient creates a password, then provides a full name and mobile number.                 | `/reset-password?invite=company-team` and `/complete-team-profile` |
| 6    | The membership becomes active and the recipient arrives at **Browse Guards**.                  | `/browse`                                                          |

> The recipient must be invited as a **new** user. Existing We Find Guards users are added to the selected company team immediately and do not receive an invitation email.

## Required Hosted Supabase Configuration

The public browser key supplied for the project can authenticate client requests, but it cannot modify Auth email or SMTP settings. Apply the following settings in the Supabase Dashboard for project `yatawyeamsaxemjctggp`, using a project owner’s Supabase account.

### 1. Configure the branded sender

Open **Authentication → SMTP Settings** and enable a custom SMTP provider. Use a verified sender address that belongs to We Find Guards, for example `no-reply@wefindguards.com`, and set the sender name to:

```text
We Find Guards
```

The default Supabase mail service is not suitable for production invitations: delivery is restricted to authorized addresses and rate limited. A verified custom SMTP service is required for normal recipient delivery and gives the email its branded From identity. Configure the provider’s SPF, DKIM, and DMARC records before sending production invitations.

### 2. Set the production redirect configuration

Open **Authentication → URL Configuration** and set the **Site URL** to:

```text
https://wefindguards.com
```

In **Redirect URLs**, add this exact production route:

```text
https://wefindguards.com/reset-password?invite=company-team
```

This is the fallback redirect submitted by the Edge Function. The primary email link uses the site URL to open `/accept-team-invitation`, so the Site URL must use the public We Find Guards domain. Keep any existing development or preview URLs that the deployment requires.

### 3. Apply the account confirmation and Invite user templates

Open **Authentication → Email Templates → Invite user** and set the subject to:

```text
You’ve been added to a We Find Guards team
```

Copy the complete contents of [`supabase/templates/invite.html`](../supabase/templates/invite.html) into the Invite user HTML editor and save. The template contains the required `{{ .TokenHash }}` variable and only a We Find Guards link; it deliberately contains no Supabase branding.

For new direct account registrations, set the Confirm signup subject to:

```text
Welcome to We Find Guards — confirm your account
```

Then copy [`supabase/templates/confirm-account.html`](../supabase/templates/confirm-account.html) into the Confirm signup HTML editor.

Alternatively, a project owner may apply the subject and HTML through the Supabase Management API:

```sh
cd supabase-migration-hub
export SUPABASE_ACCESS_TOKEN="<Supabase personal access token>"
./scripts/apply-supabase-auth-branding.sh
```

The script updates the **Invite user** and **Confirm signup** subjects and templates. It does not alter the site URL, redirect allow list, SMTP details, or other authentication settings.

### 4. Set the Edge Function’s application origin

The `manage-company-team` function defaults to `https://wefindguards.com`. If production is served from a different approved domain, set the Edge Function secret `APP_URL` to that exact origin, without a trailing slash, and add the matching password route to Supabase Auth’s Redirect URLs. Do not use a browser-provided origin for this setting.

## Deployment Order

1. Commit and deploy the application and Edge Function changes in this repository.
2. Configure custom SMTP, sender name, Site URL, and redirect URL in the hosted Supabase project.
3. Apply the Invite user subject and HTML template.
4. Invite a newly created test email address from a company owner or administrator account.
5. Confirm the email From name is **We Find Guards**, the subject is correct, the body does not mention Supabase, the button opens the branded activation page, a password can be created, the member supplies a name and mobile number, and the resulting user lands at **Browse Guards**.

## Operational Notes

Invitation links are single-use and may expire. A recipient who reaches the unavailable-link screen should be sent a newly generated invitation. Avoid testing by repeatedly opening the same email link, because some email security scanners prefetch links; if this becomes an issue for recipient mailboxes, use Supabase’s OTP-based confirmation approach rather than a direct one-time link.

Changing an email template does not change the From address. The custom SMTP sender name and verified From address are what make the recipient-visible sender read **We Find Guards**.

## References

[1] [Supabase: Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)

[2] [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

[3] [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
