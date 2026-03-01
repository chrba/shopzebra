#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { ShopZebraApiStack } from '../lib/shopzebra-api-stack'

const app = new cdk.App()

new ShopZebraApiStack(app, 'ShopZebraApiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'eu-central-1',
  },
})
