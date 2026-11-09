export type { HealthCheckable } from './ports/health-checkable.js';
export {
  DynamoDbLocalAdapter,
  type DynamoDbLocalAdapterOptions,
} from './adapters/dynamodb-local.adapter.js';
export {
  DynamoDbAwsAdapter,
  type DynamoDbAwsAdapterOptions,
} from './adapters/dynamodb-aws.adapter.js';

export {
  createDynamoDbClient,
  createDocumentClient,
  type DynamoDbClientOptions,
} from './table/client.js';
export { ensureTableExists } from './table/bootstrap.js';

export { DynamoUserRepository } from './repositories/user.repository.js';
export { DynamoTenantRepository } from './repositories/tenant.repository.js';
export { DynamoSessionRepository } from './repositories/session.repository.js';
export { DynamoIncomeRepository } from './repositories/income.repository.js';
export { DynamoExpenseRepository } from './repositories/expense.repository.js';
export { DynamoAccountRepository } from './repositories/account.repository.js';
