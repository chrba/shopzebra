#!/usr/bin/env bash
# Usage: 03b-verify-and-login.sh <verification-code>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

CODE="${1:?usage: 03b-verify-and-login.sh <verification-code>}"

# Verify the email — after this it becomes an active alias
aws cognito-idp verify-user-attribute --access-token "$ACCESS_TOKEN" \
  --attribute-name email --code "$CODE"

# Sign in using the EMAIL as username, same password as before
AUTH=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$SPIKE_EMAIL,PASSWORD=$SHADOW_PASSWORD")
ID_TOKEN=$(echo "$AUTH" | jq -r .AuthenticationResult.IdToken)
SUB_EMAIL=$(jwt_claim "$ID_TOKEN" sub)

expect "login via email alias yields SAME sub" "$SUB_EMAIL" "$SUB1"
echo "OK: email alias works, identity is stable."
