import * as cdk from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as path from 'path'
import { Construct } from 'constructs'
import { RustFunction } from 'cargo-lambda-cdk'

const SERVICES_DIR = path.join(__dirname, '..', '..', '..', 'services')

/**
 * The user pool that makes shadow accounts possible. Both decisive
 * settings — email as an alias and no required attributes — are immutable
 * after creation, which is why the old pool could not be reused (see
 * spikes/cognito-shadow-account/findings.md).
 */
export class ShopZebraUserPool extends Construct {
  readonly userPool: cognito.UserPool
  readonly userPoolClient: cognito.UserPoolClient
  readonly issuer: string
  readonly domainPrefix: string

  constructor(scope: Construct, id: string) {
    super(scope, id)

    const preSignUp = new RustFunction(this, 'PreSignUpFunction', {
      functionName: 'shopzebra-pre-signup',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'pre-signup'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
    })

    this.userPool = new cognito.UserPool(this, 'Pool', {
      userPoolName: 'shopzebra',
      selfSignUpEnabled: true,
      // Username: the app's UUID for a shadow account. Email is an alias
      // that linking adds later — it can never become the username here.
      signInAliases: { username: true, email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: false, mutable: true } },
      lambdaTriggers: { preSignUp },
      // Deleting the pool would delete every account and orphan every
      // aggregate that belongs to one.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.domainPrefix = `shopzebra-${cdk.Stack.of(this).account}`
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: this.domainPrefix },
    })

    this.userPoolClient = this.userPool.addClient('AppClient', {
      // Amplify signs in with SRP by default; the shadow account's password
      // never leaves the device in plain text either way.
      authFlows: { userSrp: true },
      generateSecret: false,
      // Google and Apple arrive with M2 (linking), not before.
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    })

    this.issuer = `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`
  }
}
