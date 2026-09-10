#!/usr/bin/env bash
# Deploys the workflow-notification function and securely schedules its dispatcher.
# All credentials are supplied at runtime and are never saved in the repository.
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-yatawyeamsaxemjctggp}"
APP_URL="${APP_URL:-https://wefindguards.com}"
FUNCTION_ORIGIN="https://${PROJECT_REF}.supabase.co"
: "${SUPABASE_ACCESS_TOKEN:?Set a Supabase personal access token in SUPABASE_ACCESS_TOKEN.}"
: "${RESEND_API_KEY:?Set the Resend API key in RESEND_API_KEY.}"
: "${SUPABASE_ANON_KEY:?Set the Supabase publishable/anon key in SUPABASE_ANON_KEY.}"

if [[ -n "${NOTIFICATION_CRON_SECRET:-}" ]]; then
  CRON_SECRET="$NOTIFICATION_CRON_SECRET"
else
  CRON_SECRET="$(openssl rand -hex 32)"
fi

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

vault_upsert_sql() {
  local name="$1"
  local value="$2"
  local escaped_name escaped_value
  escaped_name="$(sql_escape "$name")"
  escaped_value="$(sql_escape "$value")"
  cat <<SQL
DO \$\$
DECLARE secret_id uuid;
BEGIN
  SELECT id INTO secret_id FROM vault.secrets WHERE name = '${escaped_name}' LIMIT 1;
  IF secret_id IS NULL THEN
    PERFORM vault.create_secret('${escaped_value}', '${escaped_name}');
  ELSE
    PERFORM vault.update_secret(secret_id, '${escaped_value}', '${escaped_name}');
  END IF;
END
\$\$;
SQL
}

run_query() {
  local query="$1"
  local payload
  payload="$(jq -n --arg query "$query" '{query: $query}')"
  curl --fail-with-body --silent --show-error \
    --request POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
    --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    --header "Content-Type: application/json" \
    --data "$payload" >/dev/null
}

run_query "$(vault_upsert_sql notification_project_url "$FUNCTION_ORIGIN")"
run_query "$(vault_upsert_sql notification_publishable_key "$SUPABASE_ANON_KEY")"
run_query "$(vault_upsert_sql notification_cron_secret "$CRON_SECRET")"

npx supabase secrets set \
  "RESEND_API_KEY=${RESEND_API_KEY}" \
  "APP_URL=${APP_URL}" \
  "NOTIFICATION_CRON_SECRET=${CRON_SECRET}" \
  --project-ref "$PROJECT_REF" >/dev/null
npx supabase functions deploy send-workflow-notifications --project-ref "$PROJECT_REF" --no-verify-jwt >/dev/null

run_query "SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'dispatch-workflow-notifications';
SELECT cron.schedule(
  'dispatch-workflow-notifications',
  '*/15 * * * *',
  \$cron\$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_project_url') || '/functions/v1/send-workflow-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_publishable_key'),
        'x-notification-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_cron_secret')
      ),
      body := jsonb_build_object('action', 'dispatch')
    );
  \$cron\$
);"

echo "Workflow notifications are deployed. The dispatcher runs every 15 minutes; each active reminder is resent 24 hours after its prior delivery."
