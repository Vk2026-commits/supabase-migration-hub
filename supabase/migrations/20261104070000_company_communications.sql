BEGIN;
CREATE TABLE public.company_communications (
 company_id uuid NOT NULL REFERENCES public.company_profiles(id),
 provider_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('call','sms')),
 agent_id text,
 agent_name text,
 started_at timestamptz,
 duration_ms bigint NOT NULL DEFAULT 0,
 direction text,
 from_number text,
 to_number text,
 status text,
 summary text,
 sentiment text,
 successful boolean,
 disconnection_reason text,
 transferred boolean NOT NULL DEFAULT false,
 synced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,provider_id)
);
ALTER TABLE public.company_communications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.company_communications TO authenticated;
CREATE POLICY company_communications_read ON public.company_communications FOR SELECT TO authenticated
 USING(public.company_team_has_access(company_id,ARRAY['owner','admin','hiring_manager']::public.company_member_role[]));
CREATE INDEX company_communications_date ON public.company_communications(company_id,started_at DESC);
CREATE TABLE public.company_communication_sync (
 company_id uuid PRIMARY KEY REFERENCES public.company_profiles(id),
 last_sync_at timestamptz,
 calls_complete boolean NOT NULL DEFAULT false,
 sms_complete boolean NOT NULL DEFAULT false
);
ALTER TABLE public.company_communication_sync ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.company_communication_sync TO authenticated;
CREATE POLICY company_communication_sync_read ON public.company_communication_sync FOR SELECT TO authenticated
 USING(public.company_team_has_access(company_id,ARRAY['owner','admin','hiring_manager']::public.company_member_role[]));
COMMIT;
