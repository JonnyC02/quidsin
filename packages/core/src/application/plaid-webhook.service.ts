import type { BankingProvider } from '../ports/banking-provider.js';
import type { JobQueue } from '../ports/job-queue.js';
import type { PlaidItemRepository } from '../ports/plaid-item-repository.js';

export interface PlaidWebhookServiceDeps {
  bankingProvider: BankingProvider;
  plaidItemRepository: PlaidItemRepository;
  jobQueue: JobQueue;
}

export interface PlaidWebhookPayload {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  error?: { error_message?: string } | null;
}

const TRANSACTION_WEBHOOK_TYPE = 'TRANSACTIONS';

export class PlaidWebhookService {
  constructor(private readonly deps: PlaidWebhookServiceDeps) {}

  async verifySignature(rawBody: string, jwtHeader: string | undefined): Promise<boolean> {
    return this.deps.bankingProvider.verifyWebhookSignature(rawBody, jwtHeader);
  }

  /**
   * tenantId is always resolved from OUR OWN stored PlaidItem record (via
   * item_id), never trusted from the webhook payload itself — the payload
   * only ever supplies Plaid's item_id.
   */
  async handleWebhookPayload(payload: PlaidWebhookPayload): Promise<void> {
    const item = await this.deps.plaidItemRepository.findByPlaidItemId(payload.item_id);

    if (!item) {
      return; // unknown item (e.g. already deleted) — nothing to do
    }

    if (payload.webhook_type === TRANSACTION_WEBHOOK_TYPE) {
      await this.deps.jobQueue.enqueueSync({ tenantId: item.tenantId, plaidItemId: item.id });
      return;
    }

    if (payload.webhook_type === 'ITEM' && payload.webhook_code !== 'WEBHOOK_UPDATE_ACKNOWLEDGED') {
      await this.deps.plaidItemRepository.markError(
        item.tenantId,
        item.id,
        payload.error?.error_message ?? `Item webhook: ${payload.webhook_code}`,
      );
    }
  }
}
