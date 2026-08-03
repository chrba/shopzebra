#!/usr/bin/env bash
# Usage: 04b-verify-conflict.sh <verification-code>
# Second user tries to verify an email that already belongs to user 1.
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

CODE="${1:?usage: 04b-verify-conflict.sh <verification-code>}"

echo "--- verify-user-attribute for the SECOND user (expecting AliasExistsException):"
set +e
aws cognito-idp verify-user-attribute --access-token "$TOKEN2" \
  --attribute-name email --code "$CODE" 2>&1
STATUS=$?
set -e
echo "(exit status: $STATUS)"

echo
echo "--- counter-check: does user 1 still own the alias?"
AUTH=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$SPIKE_EMAIL,PASSWORD=$SHADOW_PASSWORD")
ID_TOKEN=$(echo "$AUTH" | jq -r .AuthenticationResult.IdToken)
SUB_AFTER=$(jwt_claim "$ID_TOKEN" sub)
expect "email alias still resolves to user 1" "$SUB_AFTER" "$SUB1"
