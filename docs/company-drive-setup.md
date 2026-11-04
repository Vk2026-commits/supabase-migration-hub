# Company Google Drive export setup

The `company-drive` Edge Function uses company-scoped server authorization. Owners and active administrators connect one Google account; active owners, administrators, and hiring managers can export. Reviewers cannot export. Each application receives a separate folder; test runs use SAMPLE labels. No public sharing permissions are added. Staff use the app to export; access to the files in Google Drive follows the folder's Google permissions.

Configure these Supabase function secrets through a secure settings UI or CLI (never in source control):
- `GOOGLE_DRIVE_CLIENT_ID`: Google Cloud Web application OAuth client ID.
- `GOOGLE_DRIVE_CLIENT_SECRET`: matching client secret.
- `GOOGLE_DRIVE_TOKEN_KEY`: random 32-byte AES key encoded as base64. Keep stable; rotation requires re-encryption or reconnection.

Enable Google Drive API and configure the OAuth consent screen for this app. Register this exact authorized redirect URI:
`https://yatawyeamsaxemjctggp.supabase.co/functions/v1/company-drive`

Requested scope: `https://www.googleapis.com/auth/drive.file`. This limits the app to its created/authorized files, rather than all Drive contents. Configure the consent application's publishing/test-user status appropriately for the company account; testing-mode authorization can expire.

As a Kairos administrator, open an application, choose **Save to Google Drive**, then **Connect company Google Drive**. Authorize the company Google account. The app creates a `Kairos Security - We Find Guards applicants` root folder in that account. Return to the dialog and click **Check connection**. Export an application or complete onboarding PDF. Incomplete onboarding packets are not exported through this control.

A root folder is connected once per company. This is a shared company export destination, not automatic Google permission grants to the team. The owner can manage appropriate folder access in Drive. Do not make the folder public; onboarding packets contain sensitive employee information.

Repeated uploads of identical PDF bytes reuse the reserved Google file ID. A changed PDF receives a new versioned filename. App-generated PDFs can differ in embedded metadata on regeneration, producing a new version. Old versions are not overwritten. Successful export is reported only after Google confirms the upload/existing file and the server records completion. Connection state is one-use and expires after ten minutes. Refresh tokens are AES-GCM encrypted and stored in service-only tables.

Verification still requiring Google authorization: complete OAuth, export a synthetic application and onboarding packet, confirm both land in the same applicant folder, confirm another staff member uses that destination, retry identical bytes without duplication, and test revoked Google authorization. Never use a real employee packet for initial testing.

References: https://developers.google.com/identity/protocols/oauth2/web-server and https://developers.google.com/workspace/drive/api/guides/api-specific-auth
