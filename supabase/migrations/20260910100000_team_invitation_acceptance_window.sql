-- Track whether a team invitation link was accepted without granting workspace
-- access until the recipient finishes account creation.
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz;

ALTER TABLE public.company_members
  DROP CONSTRAINT IF EXISTS company_members_status_check;

ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_status_check
  CHECK (status IN ('invited', 'accepted', 'active', 'suspended'));

COMMENT ON COLUMN public.company_members.invite_accepted_at IS
  'Timestamp of the first successful invitation-link verification. Account activation must occur within the configured setup window.';
