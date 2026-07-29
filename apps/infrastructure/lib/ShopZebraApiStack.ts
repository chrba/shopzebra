import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigwv2_authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as path from 'path'
import type { Construct } from 'constructs'
import { RustFunction } from 'cargo-lambda-cdk'

const COGNITO_USER_POOL_ID = 'eu-central-1_z6PK2KOsC'
const COGNITO_CLIENT_ID = '1j2an4jbfpd0pjvqjil4c1ure5'
const COGNITO_ISSUER = `https://cognito-idp.eu-central-1.amazonaws.com/${COGNITO_USER_POOL_ID}`

const SERVICES_DIR = path.join(__dirname, '..', '..', '..', 'services')

export class ShopZebraApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Events table — the truth. PK = aggregateId, SK = "EVT#<position>"
    // (gap-free sequence per aggregate) plus "DUP#<eventId>" dedup
    // markers (sync-engine.md §6).
    const eventsTable = new dynamodb.Table(this, 'EventsTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // Membership projection — server-owned authorization basis, never
    // derived from client-written events.
    const membershipTable = new dynamodb.Table(this, 'MembershipTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
    membershipTable.addGlobalSecondaryIndex({
      indexName: 'byUser',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    })

    const lambdaEnvironment = {
      EVENTS_TABLE: eventsTable.tableName,
      MEMBERSHIP_TABLE: membershipTable.tableName,
      RUST_LOG: 'info',
    }

    // Lambda CPU scales with memory: the 128 MB default is ~7% of a vCPU,
    // which makes the first TLS handshake to DynamoDB take longer than the
    // 3 s default timeout — every invoke dies before its first reply.
    const rustFunctionResources = {
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      environment: lambdaEnvironment,
    }

    const createListFunction = new RustFunction(this, 'CreateListFunction', {
      functionName: 'shopzebra-create-list',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'create-list'),
      ...rustFunctionResources,
    })

    const appendEventFunction = new RustFunction(this, 'AppendEventFunction', {
      functionName: 'shopzebra-append-event',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'append-event'),
      ...rustFunctionResources,
    })

    const getEventsFunction = new RustFunction(this, 'GetEventsFunction', {
      functionName: 'shopzebra-get-events',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'get-events'),
      ...rustFunctionResources,
    })

    const getListsFunction = new RustFunction(this, 'GetListsFunction', {
      functionName: 'shopzebra-get-lists',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'get-lists'),
      ...rustFunctionResources,
    })

    eventsTable.grantReadWriteData(createListFunction)
    eventsTable.grantReadWriteData(appendEventFunction)
    eventsTable.grantReadData(getEventsFunction)
    membershipTable.grantReadWriteData(createListFunction)
    membershipTable.grantReadData(appendEventFunction)
    membershipTable.grantReadData(getEventsFunction)
    membershipTable.grantReadData(getListsFunction)

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'shopzebra-api',
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins: ['http://localhost:5173'],
      },
    })

    const authorizer = new apigwv2_authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      COGNITO_ISSUER,
      { jwtAudience: [COGNITO_CLIENT_ID] },
    )

    httpApi.addRoutes({
      path: '/lists',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('CreateListIntegration', createListFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/lists/{listId}/events',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('AppendEventIntegration', appendEventFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/lists/{listId}/events',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2_integrations.HttpLambdaIntegration('GetEventsIntegration', getEventsFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/lists',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2_integrations.HttpLambdaIntegration('GetListsIntegration', getListsFunction),
      authorizer,
    })

    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint })
    new cdk.CfnOutput(this, 'EventsTableName', { value: eventsTable.tableName })
  }
}
