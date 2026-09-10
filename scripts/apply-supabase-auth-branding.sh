#!/usr/bin/env bash
# Applies the branded team invitation subject and HTML to the hosted Supabase project.
# Authentication is supplied at runtime; no credentials are stored in this repository.
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-yatawyeamsaxemjctggp}"
: "${SUPABASE_ACCESS_TOKEN:?Set a Supabase personal access token in SUPABASE_ACCESS_TOKEN.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_PATH="$SCRIPT_DIR/../supabase/templates/invite.html"

if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo "Invitation template not found: $TEMPLATE_PATH" >&2
  exit 1
fi

payload="$(jq -n \
  --arg subject "You’ve been added to a We Find Guards team" \
  --rawfile template "$TEMPLATE_PATH" \
  '{mailer_subjects_invite: $subject, mailer_templates_invite_content: $template}')"

curl --fail-with-body --silent --show-error \
  --request PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  --header "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$payload" >/dev/null

echo "Updated the hosted Invite user email template for ${PROJECT_REF}."
