import { loadConfig } from '@quidsin/config';
import { DynamoDbLocalAdapter } from '@quidsin/database';
import { createApp } from './app.js';

const config = loadConfig();

const database = new DynamoDbLocalAdapter({
  endpoint: config.DYNAMODB_ENDPOINT,
  region: config.DYNAMODB_REGION,
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
});

const app = createApp(database);

app.listen(config.PORT, () => {
  console.log(`[api] listening on port ${config.PORT}`);
});
