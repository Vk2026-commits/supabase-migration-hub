BEGIN;
CREATE TABLE public.company_candidate_reviews (
 job_application_id uuid PRIMARY KEY REFERENCES public.job_applications(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.company_profiles(id) ON DELETE CASCADE,
 rating text NOT NULL DEFAULT 'unrated' CHECK (rating IN ('unrated','great','good','not_suitable')),
 reason text NOT NULL DEFAULT 'none' CHECK (reason IN ('none','schedule','area','future_opening','license','other')),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes)<=5000),
 follow_up_date date,
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_candidate_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company reads private candidate reviews" ON public.company_candidate_reviews FOR SELECT TO authenticated USING(public.company_team_has_access(company_id));
GRANT SELECT ON public.company_candidate_reviews TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.company_candidate_reviews FROM authenticated,anon;
CREATE INDEX ON public.company_candidate_reviews(company_id,rating,reason);
CREATE FUNCTION public.save_candidate_review(_application_id uuid,_rating text,_reason text,_notes text,_follow_up_date date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid;
BEGIN
 SELECT p.company_id INTO company FROM job_applications a JOIN job_postings p ON p.id=a.job_posting_id WHERE a.id=_application_id;
 IF company IS NULL OR NOT public.company_team_has_access(company,ARRAY['owner','admin','hiring_manager']::public.company_member_role[]) THEN RAISE EXCEPTION 'Only authorized hiring staff can update candidate ratings'; END IF;
 IF _reason='other' AND length(trim(coalesce(_notes,'')))=0 THEN RAISE EXCEPTION 'Add a note for Other'; END IF;
 INSERT INTO company_candidate_reviews(job_application_id,company_id,rating,reason,notes,follow_up_date,updated_by)
 VALUES(_application_id,company,_rating,_reason,trim(coalesce(_notes,'')),_follow_up_date,auth.uid())
 ON CONFLICT(job_application_id) DO UPDATE SET rating=excluded.rating,reason=excluded.reason,notes=excluded.notes,follow_up_date=excluded.follow_up_date,updated_by=excluded.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_candidate_review(uuid,text,text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_candidate_review(uuid,text,text,text,date) TO authenticated;
COMMIT;
