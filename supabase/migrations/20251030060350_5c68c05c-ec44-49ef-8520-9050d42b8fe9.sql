-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the profile reminder email to run every Monday at 9:00 AM
SELECT cron.schedule(
  'weekly-profile-reminder',
  '0 9 * * 1', -- Every Monday at 9:00 AM (cron format: minute hour day month day-of-week)
  $$
  SELECT
    net.http_post(
        url:='https://mxfffglrhzjkeakybwrx.supabase.co/functions/v1/send-profile-reminder',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZmZmZ2xyaHpqa2Vha3lid3J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTc3NDMsImV4cCI6MjA3NjU3Mzc0M30.AtbdUp1CowrCf_QJPlTMJJPnXmTyUM3pyFdI67NLIv8"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);