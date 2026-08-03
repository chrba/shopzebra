#!/usr/bin/env bash
# Configures Google as IdP on the spike pool, reusing the OAuth client
# that is already registered on the production pool.
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

PROD_POOL=eu-central-1_z6PK2KOsC
DOMAIN=shopzebra-spike-shadow
save_var COGNITO_DOMAIN "$DOMAIN"

# Read the existing Google OAuth credentials (read-only on the prod pool)
DETAILS=$(aws cognito-idp describe-identity-provider --user-pool-id "$PROD_POOL" \
  --provider-name Google --query 'IdentityProvider.ProviderDetails' --output json)
G_CLIENT_ID=$(echo "$DETAILS" | jq -r .client_id)
G_CLIENT_SECRET=$(echo "$DETAILS" | jq -r .client_secret)
[ "$G_CLIENT_SECRET" != "null" ] || { echo "FAIL: client_secret not readable" >&2; exit 1; }

aws cognito-idp create-user-pool-domain --domain "$DOMAIN" --user-pool-id "$POOL_ID"

aws cognito-idp create-identity-provider --user-pool-id "$POOL_ID" \
  --provider-name Google --provider-type Google \
  --provider-details "client_id=$G_CLIENT_ID,client_secret=$G_CLIENT_SECRET,authorize_scopes=openid email profile" \
  --attribute-mapping email=email > /dev/null

# Enable hosted-UI code flow + Google on the app client
aws cognito-idp update-user-pool-client --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO Google \
  --callback-urls "https://example.com/cb" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client > /dev/null

echo "Hosted UI: https://$DOMAIN.auth.$REGION.amazoncognito.com"
echo
echo "ADD THIS REDIRECT URI to the existing Google OAuth client:"
echo "  https://$DOMAIN.auth.$REGION.amazoncognito.com/oauth2/idpresponse"
echo "Google client: $G_CLIENT_ID"
