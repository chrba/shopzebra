import { Amplify } from 'aws-amplify'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'eu-central-1_z6PK2KOsC',
      userPoolClientId: '1j2an4jbfpd0pjvqjil4c1ure5',
      loginWith: {
        oauth: {
          domain: 'eu-central-1z6pk2kosc.auth.eu-central-1.amazoncognito.com',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['http://localhost:5173/'],
          redirectSignOut: ['http://localhost:5173/'],
          responseType: 'code',
        },
      },
    },
  },
})
