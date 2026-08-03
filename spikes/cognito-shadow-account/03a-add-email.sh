#!/usr/bin/env bash
# Usage: 03a-add-email.sh <email>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

SPIKE_EMAIL="${1:?usage: 03a-add-email.sh <email>}"
save_var SPIKE_EMAIL "$SPIKE_EMAIL"

# User-facing call (access token, not admin) — the same call the app makes
aws cognito-idp update-user-attributes --access-token "$ACCESS_TOKEN" \
  --user-attributes "Name=email,Value=$SPIKE_EMAIL" \
  | jq .CodeDeliveryDetailsList

echo "Check the inbox of $SPIKE_EMAIL, then run: ./03b-verify-and-login.sh <code>"
