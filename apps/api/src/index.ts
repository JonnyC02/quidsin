import { loadConfig } from '@quidsin/config';
import { createDynamoDbClient, DynamoDbLocalAdapter, ensureTableExists } from '@quidsin/database';
import { buildApiApp } from './build-server.js';

const config = loadConfig();

const dynamoClient = createDynamoDbClient({
  endpoint: config.DYNAMODB_ENDPOINT,
  region: config.DYNAMODB_REGION,
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
});

await ensureTableExists(dynamoClient, config.DYNAMODB_TABLE_NAME);

const database = new DynamoDbLocalAdapter({
  endpoint: config.DYNAMODB_ENDPOINT,
  region: config.DYNAMODB_REGION,
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
});

const { app } = await buildApiApp(config, { database, dynamoClient });

app.listen(config.PORT, () => {
  console.log(`[api] listening on port ${config.PORT}`);
});
