export const GSI1_NAME = 'GSI1';

export interface PrimaryKey {
  pk: string;
  sk: string;
}

export interface Gsi1Key {
  gsi1pk: string;
  gsi1sk: string;
}

export const keys = {
  user: (id: string): PrimaryKey => ({ pk: `USER#${id}`, sk: `USER#${id}` }),
  tenant: (id: string): PrimaryKey => ({ pk: `TENANT#${id}`, sk: `TENANT#${id}` }),
  session: (id: string): PrimaryKey => ({ pk: `SESSION#${id}`, sk: `SESSION#${id}` }),
  income: (tenantId: string, id: string): PrimaryKey => ({
    pk: `TENANT#${tenantId}`,
    sk: `INCOME#${id}`,
  }),
  expense: (tenantId: string, id: string): PrimaryKey => ({
    pk: `TENANT#${tenantId}`,
    sk: `EXPENSE#${id}`,
  }),
  account: (tenantId: string, id: string): PrimaryKey => ({
    pk: `TENANT#${tenantId}`,
    sk: `ACCOUNT#${id}`,
  }),
  plaidItem: (tenantId: string, id: string): PrimaryKey => ({
    pk: `TENANT#${tenantId}`,
    sk: `PLAID_ITEM#${id}`,
  }),
  transaction: (tenantId: string, id: string): PrimaryKey => ({
    pk: `TENANT#${tenantId}`,
    sk: `TRANSACTION#${id}`,
  }),
  /** The entire sync queue lives in one partition — always small at this app's scale. */
  job: (plaidItemId: string): PrimaryKey => ({ pk: 'QUEUE#SYNC', sk: `JOB#${plaidItemId}` }),
  tenantPrefix: (tenantId: string): string => `TENANT#${tenantId}`,
} as const;

export const gsi1 = {
  sessionByUser: (userId: string, sessionId: string): Gsi1Key => ({
    gsi1pk: `USER#${userId}`,
    gsi1sk: `SESSION#${sessionId}`,
  }),
  userPrefix: (userId: string): string => `USER#${userId}`,
  /**
   * A second, non-colliding lookup pattern reusing the existing GSI1
   * rather than adding a new index — webhooks only carry Plaid's own
   * item_id, never our tenantId, so this is the only way to resolve one.
   */
  plaidItemByPlaidId: (plaidItemId: string): Gsi1Key => ({
    gsi1pk: `PLAID_ITEM#${plaidItemId}`,
    gsi1sk: `PLAID_ITEM#${plaidItemId}`,
  }),
} as const;

/** Internal DynamoDB item attributes that must never leak into a domain entity. */
export const INTERNAL_ATTRIBUTES = ['pk', 'sk', 'gsi1pk', 'gsi1sk', 'entityType', 'ttl'] as const;

export function stripInternalAttributes<T>(item: Record<string, unknown>): T {
  const clean: Record<string, unknown> = { ...item };
  for (const attribute of INTERNAL_ATTRIBUTES) {
    delete clean[attribute];
  }
  return clean as T;
}
