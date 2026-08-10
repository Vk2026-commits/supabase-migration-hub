-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily evaluation reminder emails at 9 AM UTC
SELECT cron.schedule(
  'send-evaluation-reminders-daily',
  '0 9 * * *', -- Every day at 9:00 AM UTC
  $$
  SELECT
    net.http_post(
        url:=concat(current_setting('app.settings.supabase_url'), '/functions/v1/send-evaluation-reminder'),
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', concat('Bearer ', current_setting('app.settings.service_role_key'))
        ),
        body:=jsonb_build_object('time', now())
    ) as request_id;
  $$
);