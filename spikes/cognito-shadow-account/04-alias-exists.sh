#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

# Second shadow user
USER2=$(uuidgen | tr '[:upper:]' '[:lower:]')
PASS2="$(openssl rand -base64 30)aA1!"
save_var USER2 "$USER2"
save_var PASS2 "$PASS2"
aws cognito-idp sign-up --client-id "$CLIENT_ID" --username "$USER2" --password "$PASS2" > /dev/null
AUTH2=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" --auth-parameters "USERNAME=$USER2,PASSWORD=$PASS2")
TOKEN2=$(echo "$AUTH2" | jq -r .AuthenticationResult.AccessToken)
save_var TOKEN2 "$TOKEN2"

# Try to claim the SAME email as user 1
echo "--- update-user-attributes with already-used email:"
if aws cognito-idp update-user-attributes --access-token "$TOKEN2" \
     --user-attributes "Name=email,Value=$SPIKE_EMAIL" 2>&1; then
  echo "(accepted — per docs the conflict surfaces at VERIFY time)"
  echo "Next: ./04b-verify-conflict.sh <code-from-inbox>"
fi
