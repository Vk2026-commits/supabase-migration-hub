-- A confirmed user may own one company while serving on other company teams.
-- Access remains scoped by the existing (company_id, user_id) uniqueness and RLS.
DROP INDEX IF EXISTS public.company_members_one_company_per_user;

CREATE INDEX IF NOT EXISTS company_members_user_status_idx
  ON public.company_members(user_id, status);

COMMENT ON TABLE public.company_members IS
  'Company-scoped workspace memberships. A user may belong to multiple companies with an independent role in each.';
