#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

# --- Silent sign-up: UUID username, random password, NO attributes ---
# Suffix guarantees the generated password meets the default policy
# (upper, lower, digit, symbol) — base64 alone may miss a symbol.
SHADOW_USERNAME=$(uuidgen | tr '[:upper:]' '[:lower:]')
SHADOW_PASSWORD="$(openssl rand -base64 30)aA1!"
save_var SHADOW_USERNAME "$SHADOW_USERNAME"
save_var SHADOW_PASSWORD "$SHADOW_PASSWORD"

SIGNUP=$(aws cognito-idp sign-up --client-id "$CLIENT_ID" \
  --username "$SHADOW_USERNAME" --password "$SHADOW_PASSWORD")
CONFIRMED=$(echo "$SIGNUP" | jq -r .UserConfirmed)
expect "user auto-confirmed by pre-signup trigger" "$CONFIRMED" "true"

# --- Sign in with the generated credentials ---
AUTH=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$SHADOW_USERNAME,PASSWORD=$SHADOW_PASSWORD")
ID_TOKEN=$(echo "$AUTH" | jq -r .AuthenticationResult.IdToken)
ACCESS_TOKEN=$(echo "$AUTH" | jq -r .AuthenticationResult.AccessToken)
save_var ACCESS_TOKEN "$ACCESS_TOKEN"

SUB1=$(jwt_claim "$ID_TOKEN" sub)
[ -n "$SUB1" ] || { echo "FAIL: no sub in id token" >&2; exit 1; }
save_var SUB1 "$SUB1"

echo "OK: signed in without email. sub=$SUB1"
echo "--- attributes on the shadow user:"
aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" \
  --username "$SHADOW_USERNAME" --query 'UserAttributes' --output json
