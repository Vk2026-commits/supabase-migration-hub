-- Recover missed webhook deliveries by reloading the latest provider pages.
-- The bridge secret is provisioned separately into Vault; never store it in migrations.
BEGIN;
CREATE OR REPLACE FUNCTION public.refresh_kairos_communications() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE token text; kind text;
BEGIN
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='wfg_retell_bridge' LIMIT 1;
 IF token IS NULL THEN RETURN; END IF;
 FOREACH kind IN ARRAY ARRAY['call','sms'] LOOP
  PERFORM net.http_post(
   url:='https://yatawyeamsaxemjctggp.supabase.co/functions/v1/company-communications',
   headers:=jsonb_build_object('Content-Type','application/json','x-wfg-bridge',token),
   body:=jsonb_build_object('action','sync','kind',kind),timeout_milliseconds:=60000);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.refresh_kairos_communications() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('kairos-communications-recovery','*/5 * * * *','SELECT public.refresh_kairos_communications()');
COMMIT;
