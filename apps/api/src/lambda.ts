import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { configure as serverlessExpress } from '@codegenie/serverless-express';
import { loadConfigFromSsm } from '@quidsin/config';
import { DynamoDbAwsAdapter } from '@quidsin/database';
import { buildApiApp } from './build-server.js';
import { requireEnv } from './infra/require-env.js';

const config = await loadConfigFromSsm({
  GOOGLE_CLIENT_ID: requireEnv('GOOGLE_CLIENT_ID_PARAM'),
  PLAID_CLIENT_ID: requireEnv('PLAID_CLIENT_ID_PARAM'),
  PLAID_SECRET: requireEnv('PLAID_SECRET_PARAM'),
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY_PARAM'),
});

const dynamoClient = new DynamoDBClient({ region: config.DYNAMODB_REGION });
const database = new DynamoDbAwsAdapter({ region: config.DYNAMODB_REGION });

const { app } = await buildApiApp(config, { database, dynamoClient });

export const handler = serverlessExpress({ app });
