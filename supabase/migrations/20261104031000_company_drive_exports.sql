BEGIN;
-- Credentials and OAuth state are service-only. Never expose them through REST.
CREATE TABLE public.company_drive_connections (
 company_id uuid PRIMARY KEY REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 refresh_token_cipher text NOT NULL,
 root_folder_id text,
 connected_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.company_drive_oauth_states (
 state_hash text PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id),
 expires_at timestamptz NOT NULL
);
CREATE TABLE public.company_drive_folders (
 company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 job_application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
 folder_id text NOT NULL,
 PRIMARY KEY(company_id,job_application_id)
);
CREATE TABLE public.company_drive_exports (
 company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 job_application_id uuid NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
 document_kind text NOT NULL CHECK(document_kind IN ('application','onboarding')),
 content_hash text NOT NULL,
 file_id text NOT NULL,
 exported_by uuid NOT NULL REFERENCES auth.users(id),
 completed_at timestamptz,
 PRIMARY KEY(company_id,job_application_id,document_kind,content_hash)
);
ALTER TABLE public.company_drive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_drive_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_drive_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_drive_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_drive_connections,public.company_drive_oauth_states,public.company_drive_folders,public.company_drive_exports FROM anon,authenticated;
GRANT ALL ON public.company_drive_connections,public.company_drive_oauth_states,public.company_drive_folders,public.company_drive_exports TO service_role;
COMMIT;
