#!/usr/bin/env bash
# Removes ONLY the resources this spike created. The production pool
# (eu-central-1_z6PK2KOsC) is never touched.
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

echo "Deleting spike pool domain, pool, lambda and role..."
aws cognito-idp delete-user-pool-domain --domain "$COGNITO_DOMAIN" --user-pool-id "$POOL_ID" || true
aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID"
aws lambda delete-function --function-name shopzebra-spike-presignup
aws iam detach-role-policy --role-name shopzebra-spike-presignup \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name shopzebra-spike-presignup
rm -f .env.spike presignup.zip
echo "Done. (The redirect URI in the Google console — if added — must be removed manually.)"
