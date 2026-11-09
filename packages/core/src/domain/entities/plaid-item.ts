export type PlaidItemStatus = 'active' | 'disconnected' | 'error';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface PlaidItem {
  /** Plaid's own item_id — stable, same "external id is the id" pattern as User.id. */
  id: string;
  tenantId: string;
  ownerId: string;
  institutionId?: string;
  institutionName?: string;
  encryptedAccessToken: EncryptedPayload;
  /** Absent = never synced; the first sync page IS the historical backfill. */
  cursor?: string;
  status: PlaidItemStatus;
  lastSyncedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}
