// AWS Amplify configuration — connects the app to the Cognito pool that
// holds the shadow accounts. Pool and client come from the CDK outputs
// (.env.local), never from a hardcoded id. Imported as a side-effect in
// main.tsx so the SDK is configured before any auth call runs.

import { Amplify } from 'aws-amplify'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_USER_POOL_DOMAIN,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['http://localhost:5173/'],
          redirectSignOut: ['http://localhost:5173/'],
          responseType: 'code',
        },
      },
    },
  },
})
