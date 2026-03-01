import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigwv2_authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as path from 'path'
import type { Construct } from 'constructs'

const COGNITO_USER_POOL_ID = 'eu-central-1_z6PK2KOsC'
const COGNITO_CLIENT_ID = '1j2an4jbfpd0pjvqjil4c1ure5'
const COGNITO_ISSUER = `https://cognito-idp.eu-central-1.amazonaws.com/${COGNITO_USER_POOL_ID}`

export class ShopZebraApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Rust Lambda
    const helloFunction = new lambda.Function(this, 'HelloFunction', {
      functionName: 'shopzebra-hello',
      runtime: lambda.Runtime.PROVIDED_AL2023,
      architecture: lambda.Architecture.ARM_64,
      handler: 'bootstrap',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../services/target/lambda/hello'),
      ),
      environment: {
        RUST_LOG: 'info',
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    })

    // HTTP API (API Gateway v2)
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'shopzebra-api',
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins: ['http://localhost:5173'],
      },
    })

    // Cognito JWT Authorizer
    const authorizer = new apigwv2_authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      COGNITO_ISSUER,
      { jwtAudience: [COGNITO_CLIENT_ID] },
    )

    // Lambda integration
    const integration = new apigwv2_integrations.HttpLambdaIntegration(
      'HelloIntegration',
      helloFunction,
    )

    // GET /hello route with auth
    httpApi.addRoutes({
      path: '/hello',
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer,
    })

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.url ?? 'undefined',
      description: 'ShopZebra API Gateway URL',
    })
  }
}
