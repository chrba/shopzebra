import { describe, expect, test } from 'vitest'
import * as cdk from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { ShopZebraUserPool } from '../lib/ShopZebraUserPool'

function synthesizedTemplate(): Template {
  // Skip cargo-lambda bundling, like the stack test does: the template
  // shape is what we assert, the Rust binary takes minutes to build.
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } })
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: '111111111111', region: 'eu-central-1' },
  })
  new ShopZebraUserPool(stack, 'UserPool')
  return Template.fromStack(stack)
}

const template = synthesizedTemplate()

describe('shadow-account user pool', () => {
  // Without these two settings a shadow account is impossible: email must
  // stay optional, and it must be usable as a sign-in alias later.
  test('email is an alias, not the username', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AliasAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    })
  })

  test('no attribute is required for sign-up', () => {
    const pool = Object.values(
      template.findResources('AWS::Cognito::UserPool'),
    )[0]
    const required = (pool.Properties.Schema ?? []).filter(
      (attribute: { Required?: boolean }) => attribute.Required === true,
    )
    expect(required).toEqual([])
  })

  test('a pre-signup trigger auto-confirms users', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PreSignUp: Match.anyValue() },
    })
  })

  // Amplify signs in with SRP unless told otherwise; without this flow the
  // shadow account could be created but never used.
  test('the client allows the sign-in flow the app actually uses', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_SRP_AUTH']),
    })
  })
})
