import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as apigwv2_authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as path from 'path'
import type { Construct } from 'constructs'
import { RustFunction } from 'cargo-lambda-cdk'
import { ShopZebraUserPool } from './ShopZebraUserPool'

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

    // The pool that allows sign-up without an email address — the shadow
    // account every guest gets (architecture/accountless-first-planned.md).
    const identity = new ShopZebraUserPool(this, 'Identity')

    const lambdaEnvironment = {
      EVENTS_TABLE: eventsTable.tableName,
      MEMBERSHIP_TABLE: membershipTable.tableName,
      USER_POOL_ID: identity.userPool.userPoolId,
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

    const createRecipeFunction = new RustFunction(this, 'CreateRecipeFunction', {
      functionName: 'shopzebra-create-recipe',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'create-recipe'),
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

    const createInviteFunction = new RustFunction(this, 'CreateInviteFunction', {
      functionName: 'shopzebra-create-invite',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'create-invite'),
      ...rustFunctionResources,
    })

    const joinListFunction = new RustFunction(this, 'JoinListFunction', {
      functionName: 'shopzebra-join-list',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'join-list'),
      ...rustFunctionResources,
    })

    const addMemberFunction = new RustFunction(this, 'AddMemberFunction', {
      functionName: 'shopzebra-add-member',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'add-member'),
      ...rustFunctionResources,
    })

    const removeMemberFunction = new RustFunction(this, 'RemoveMemberFunction', {
      functionName: 'shopzebra-remove-member',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'remove-member'),
      ...rustFunctionResources,
    })

    const createFriendInviteFunction = new RustFunction(this, 'CreateFriendInviteFunction', {
      functionName: 'shopzebra-create-friend-invite',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'create-friend-invite'),
      ...rustFunctionResources,
    })

    const acceptFriendInviteFunction = new RustFunction(this, 'AcceptFriendInviteFunction', {
      functionName: 'shopzebra-accept-friend-invite',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'accept-friend-invite'),
      ...rustFunctionResources,
    })

    const getFriendsFunction = new RustFunction(this, 'GetFriendsFunction', {
      functionName: 'shopzebra-get-friends',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'get-friends'),
      ...rustFunctionResources,
    })

    const removeFriendFunction = new RustFunction(this, 'RemoveFriendFunction', {
      functionName: 'shopzebra-remove-friend',
      manifestPath: path.join(SERVICES_DIR, 'lambdas', 'remove-friend'),
      ...rustFunctionResources,
    })

    eventsTable.grantReadWriteData(createListFunction)
    eventsTable.grantReadWriteData(createRecipeFunction)
    membershipTable.grantReadWriteData(createRecipeFunction)
    eventsTable.grantReadWriteData(appendEventFunction)
    eventsTable.grantReadData(getEventsFunction)
    membershipTable.grantReadWriteData(createListFunction)
    membershipTable.grantReadData(appendEventFunction)
    membershipTable.grantReadData(getEventsFunction)
    membershipTable.grantReadData(getListsFunction)
    // Invites live in the membership table, so the invite lambdas need
    // write access there; only the joiner and the remover append events.
    membershipTable.grantReadWriteData(createInviteFunction)
    membershipTable.grantReadWriteData(joinListFunction)
    membershipTable.grantReadWriteData(removeMemberFunction)
    eventsTable.grantReadWriteData(joinListFunction)
    eventsTable.grantReadWriteData(removeMemberFunction)
    membershipTable.grantReadWriteData(addMemberFunction)
    // The address book lives in the membership table under USER# keys.
    membershipTable.grantReadWriteData(createFriendInviteFunction)
    membershipTable.grantReadWriteData(acceptFriendInviteFunction)
    membershipTable.grantReadWriteData(removeFriendFunction)
    membershipTable.grantReadData(getFriendsFunction)
    eventsTable.grantReadWriteData(addMemberFunction)

    // Display names live in the user pool, keyed by username — which is the
    // user id the client minted, so one AdminGetUser per name.
    const readUserPolicy = new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [identity.userPool.userPoolArn],
    })
    joinListFunction.addToRolePolicy(readUserPolicy)
    getListsFunction.addToRolePolicy(readUserPolicy)
    addMemberFunction.addToRolePolicy(readUserPolicy)
    getFriendsFunction.addToRolePolicy(readUserPolicy)

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'shopzebra-api',
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.DELETE, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins: ['http://localhost:5173'],
      },
    })

    const authorizer = new apigwv2_authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      identity.issuer,
      { jwtAudience: [identity.userPoolClient.userPoolClientId] },
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

    httpApi.addRoutes({
      path: '/lists/{listId}/invites',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('CreateInviteIntegration', createInviteFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/lists/join',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('JoinListIntegration', joinListFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/lists/{listId}/members',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('AddMemberIntegration', addMemberFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/lists/{listId}/members/{memberId}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new apigwv2_integrations.HttpLambdaIntegration('RemoveMemberIntegration', removeMemberFunction),
      authorizer,
    })

    // Sharing is one mechanism for every aggregate (sharing-model.md): the
    // recipe routes reach the very same lambdas, which read the kind from
    // the path. Joining needs no recipe route — the token says what is
    // being joined.
    httpApi.addRoutes({
      path: '/recipes',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('CreateRecipeIntegration', createRecipeFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/recipes',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2_integrations.HttpLambdaIntegration('GetRecipesIntegration', getListsFunction),
      authorizer,
    })

    // The generic class-1 path, now for recipes too — same lambdas, they
    // read kind and id from the route.
    httpApi.addRoutes({
      path: '/recipes/{recipeId}/events',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('AppendRecipeEventIntegration', appendEventFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/recipes/{recipeId}/events',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2_integrations.HttpLambdaIntegration('GetRecipeEventsIntegration', getEventsFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/recipes/{recipeId}/invites',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('CreateRecipeInviteIntegration', createInviteFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/recipes/{recipeId}/members',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('AddRecipeMemberIntegration', addMemberFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/recipes/{recipeId}/members/{memberId}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new apigwv2_integrations.HttpLambdaIntegration('RemoveRecipeMemberIntegration', removeMemberFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/friends/invites',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('CreateFriendInviteIntegration', createFriendInviteFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/friends/join',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration('AcceptFriendInviteIntegration', acceptFriendInviteFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/friends',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2_integrations.HttpLambdaIntegration('GetFriendsIntegration', getFriendsFunction),
      authorizer,
    })

    httpApi.addRoutes({
      path: '/friends/{friendId}',
      methods: [apigwv2.HttpMethod.DELETE],
      integration: new apigwv2_integrations.HttpLambdaIntegration('RemoveFriendIntegration', removeFriendFunction),
      authorizer,
    })

    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint })
    new cdk.CfnOutput(this, 'EventsTableName', { value: eventsTable.tableName })
    // The app reads these three into apps/mobile/.env.local.
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: identity.userPool.userPoolId,
    })
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: identity.userPoolClient.userPoolClientId,
    })
    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `${identity.domainPrefix}.auth.${this.region}.amazoncognito.com`,
    })
  }
}
