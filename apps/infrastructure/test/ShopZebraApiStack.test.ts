import { describe, expect, test } from 'vitest'
import * as cdk from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { ShopZebraApiStack } from '../lib/ShopZebraApiStack'

// These tests assert on the synthesized CloudFormation template — the
// deployable artifact and therefore the stack's public interface. They
// know nothing about how the stack is wired internally.

function synthesizedTemplate(): Template {
  // Skip cargo-lambda bundling: the template shape is what we assert,
  // the Rust binaries are irrelevant here and take minutes to build.
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } })
  return Template.fromStack(new ShopZebraApiStack(app, 'TestStack'))
}

const template = synthesizedTemplate()

describe('every lambda function', () => {
  // Regression guard: the CDK defaults (3 s timeout, 128 MB ≈ 7% of a
  // vCPU) let the first TLS handshake to DynamoDB outlive the timeout —
  // every single request died with a 500 and no log line. A newly added
  // function without explicit resources would reintroduce exactly that.
  const MINIMUM_MEMORY_MB = 512
  const MINIMUM_TIMEOUT_SECONDS = 10

  const lambdaFunctions = Object.entries(
    template.findResources('AWS::Lambda::Function'),
  )

  test('exists at least once in the template', () => {
    expect(lambdaFunctions.length).toBeGreaterThan(0)
  })

  test.each(lambdaFunctions)(
    '%s has enough CPU to finish its first TLS handshake',
    (_logicalId, resource) => {
      expect(resource.Properties.MemorySize).toBeGreaterThanOrEqual(MINIMUM_MEMORY_MB)
    },
  )

  test.each(lambdaFunctions)(
    '%s has enough time to answer a cold DynamoDB request',
    (_logicalId, resource) => {
      expect(resource.Properties.Timeout).toBeGreaterThanOrEqual(MINIMUM_TIMEOUT_SECONDS)
    },
  )
})

describe('every API route', () => {
  // The event log is per-family data — an unauthorized route would
  // expose it to anyone with the URL.
  const routes = Object.entries(template.findResources('AWS::ApiGatewayV2::Route'))

  test.each(routes)('%s requires a JWT', (_logicalId, resource) => {
    expect(resource.Properties.AuthorizationType).toBe('JWT')
  })
})
