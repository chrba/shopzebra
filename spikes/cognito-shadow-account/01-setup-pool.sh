#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ./00-env.sh

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
save_var ACCOUNT_ID "$ACCOUNT_ID"

# --- IAM role for the pre-signup trigger ---
ROLE_ARN=$(aws iam create-role --role-name shopzebra-spike-presignup \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --query Role.Arn --output text)
aws iam attach-role-policy --role-name shopzebra-spike-presignup \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
save_var ROLE_ARN "$ROLE_ARN"
echo "Waiting 10s for IAM propagation..."
sleep 10

# --- Pre-signup Lambda ---
zip -q presignup.zip presignup.js
LAMBDA_ARN=$(aws lambda create-function --function-name shopzebra-spike-presignup \
  --runtime nodejs20.x --handler presignup.handler --role "$ROLE_ARN" \
  --zip-file fileb://presignup.zip --query FunctionArn --output text)
save_var LAMBDA_ARN "$LAMBDA_ARN"

# --- Throwaway user pool: email as ALIAS (not required), auto-verify on ---
POOL_ID=$(aws cognito-idp create-user-pool --pool-name shopzebra-spike-shadow \
  --alias-attributes email \
  --auto-verified-attributes email \
  --lambda-config "PreSignUp=$LAMBDA_ARN" \
  --query UserPool.Id --output text)
save_var POOL_ID "$POOL_ID"

# Allow Cognito to invoke the trigger
aws lambda add-permission --function-name shopzebra-spike-presignup \
  --statement-id cognito-invoke --action lambda:InvokeFunction \
  --principal cognito-idp.amazonaws.com \
  --source-arn "arn:aws:cognito-idp:$REGION:$ACCOUNT_ID:userpool/$POOL_ID" > /dev/null

# --- App client: no secret, plain password auth (what the app would use) ---
CLIENT_ID=$(aws cognito-idp create-user-pool-client --user-pool-id "$POOL_ID" \
  --client-name spike-client --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --query UserPoolClient.ClientId --output text)
save_var CLIENT_ID "$CLIENT_ID"

echo "Pool:   $POOL_ID"
echo "Client: $CLIENT_ID"
