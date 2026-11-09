import type { EncryptedPayload, PlaidItem } from '../domain/entities/plaid-item.js';

export interface NewPlaidItem {
  id: string;
  tenantId: string;
  ownerId: string;
  institutionId?: string;
  institutionName?: string;
  encryptedAccessToken: EncryptedPayload;
  createdAt: string;
  updatedAt: string;
}

export interface PlaidItemRepository {
  create(item: NewPlaidItem): Promise<PlaidItem>;
  updateCursor(tenantId: string, id: string, cursor: string, lastSyncedAt: string): Promise<void>;
  markError(tenantId: string, id: string, error: string): Promise<void>;
  markDisconnected(tenantId: string, id: string): Promise<void>;
  getById(tenantId: string, id: string): Promise<PlaidItem | null>;
  /** The only lookup a webhook can perform — it only carries Plaid's item_id, never our tenantId. */
  findByPlaidItemId(plaidItemId: string): Promise<PlaidItem | null>;
  list(tenantId: string): Promise<PlaidItem[]>;
  removeAllForTenant(tenantId: string): Promise<void>;
}
