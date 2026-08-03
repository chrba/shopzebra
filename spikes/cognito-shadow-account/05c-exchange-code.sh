#!/usr/bin/env bash
# Usage: 05c-exchange-code.sh <authorization-code>
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

CODE="${1:?usage: 05c-exchange-code.sh <authorization-code>}"

RESP=$(curl -s -X POST "https://$COGNITO_DOMAIN.auth.$REGION.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&client_id=$CLIENT_ID&code=$CODE&redirect_uri=https://example.com/cb")
ID_TOKEN=$(echo "$RESP" | jq -r .id_token)
[ "$ID_TOKEN" != "null" ] || { echo "FAIL: token exchange: $RESP" >&2; exit 1; }

SUB_GOOGLE=$(jwt_claim "$ID_TOKEN" sub)
expect "federated Google login yields SAME sub as the shadow user" "$SUB_GOOGLE" "$SUB3"

echo "--- claims worth recording:"
echo "cognito:username = $(jwt_claim "$ID_TOKEN" 'cognito:username')"
echo "identities       = $(jwt_claim "$ID_TOKEN" identities)"
echo "email            = $(jwt_claim "$ID_TOKEN" email)"

echo
echo "--- users in pool (expect NO google_* user):"
aws cognito-idp list-users --user-pool-id "$POOL_ID" --query 'Users[].Username' --output json
