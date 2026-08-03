#!/usr/bin/env bash
# Usage: 05b-link-google.sh <google-sub>
# Creates a fresh shadow user (no email at all — the realistic guest case)
# and links a Google identity to it BEFORE that identity ever signs in.
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

GOOGLE_SUB="${1:?usage: 05b-link-google.sh <google-sub>}"

# --- Fresh shadow user, no attributes ---
USER3=$(uuidgen | tr '[:upper:]' '[:lower:]')
PASS3="$(openssl rand -base64 30)aA1!"
save_var USER3 "$USER3"
save_var PASS3 "$PASS3"
aws cognito-idp sign-up --client-id "$CLIENT_ID" --username "$USER3" --password "$PASS3" > /dev/null

AUTH3=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id "$CLIENT_ID" --auth-parameters "USERNAME=$USER3,PASSWORD=$PASS3")
SUB3=$(jwt_claim "$(echo "$AUTH3" | jq -r .AuthenticationResult.IdToken)" sub)
save_var SUB3 "$SUB3"
echo "Fresh shadow user: $USER3 (sub=$SUB3)"

# Link BEFORE the Google identity ever signs in via this pool —
# otherwise Cognito auto-creates a separate federated user.
aws cognito-idp admin-link-provider-for-user --user-pool-id "$POOL_ID" \
  --destination-user "ProviderName=Cognito,ProviderAttributeValue=$USER3" \
  --source-user "ProviderName=Google,ProviderAttributeName=Cognito_Subject,ProviderAttributeValue=$GOOGLE_SUB"
echo "Linked Google sub $GOOGLE_SUB -> $USER3"

echo
echo "Open this URL in the browser and sign in with Google:"
echo "https://$COGNITO_DOMAIN.auth.$REGION.amazoncognito.com/oauth2/authorize?client_id=$CLIENT_ID&response_type=code&scope=openid+email+profile&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&identity_provider=Google"
echo "You land on https://example.com/cb?code=XXXX — then run: ./05c-exchange-code.sh XXXX"
