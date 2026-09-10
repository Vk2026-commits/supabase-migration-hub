#!/usr/bin/env bash
# Applies the branded team invitation subject and HTML to the hosted Supabase project.
# Authentication is supplied at runtime; no credentials are stored in this repository.
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-yatawyeamsaxemjctggp}"
: "${SUPABASE_ACCESS_TOKEN:?Set a Supabase personal access token in SUPABASE_ACCESS_TOKEN.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INVITE_TEMPLATE_PATH="$SCRIPT_DIR/../supabase/templates/invite.html"
CONFIRMATION_TEMPLATE_PATH="$SCRIPT_DIR/../supabase/templates/confirm-account.html"

if [[ ! -f "$INVITE_TEMPLATE_PATH" || ! -f "$CONFIRMATION_TEMPLATE_PATH" ]]; then
  echo "Required Auth email template is missing." >&2
  exit 1
fi

payload="$(jq -n \
  --arg invite_subject "You’ve been added to a We Find Guards team" \
  --arg confirmation_subject "Welcome to We Find Guards — confirm your account" \
  --rawfile invite_template "$INVITE_TEMPLATE_PATH" \
  --rawfile confirmation_template "$CONFIRMATION_TEMPLATE_PATH" \
  '{
    mailer_subjects_invite: $invite_subject,
    mailer_templates_invite_content: $invite_template,
    mailer_subjects_confirmation: $confirmation_subject,
    mailer_templates_confirmation_content: $confirmation_template
  }')"

curl --fail-with-body --silent --show-error \
  --request PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$payload" >/dev/null

echo "Updated the hosted We Find Guards account confirmation and team invitation templates for ${PROJECT_REF}."
