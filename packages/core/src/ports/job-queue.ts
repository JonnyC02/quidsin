export interface SyncJob {
  tenantId: string;
  plaidItemId: string;
  attempts: number;
}

export interface JobQueue {
  /**
   * Idempotent: coalesces duplicate webhook deliveries for the same item
   * into a no-op rather than queuing a second overlapping sync.
   */
  enqueueSync(job: { tenantId: string; plaidItemId: string }): Promise<void>;
  /** SQS-style visibility-timeout claim. Returns null if nothing claimable. */
  claimNext(workerId: string, leaseDurationMs: number): Promise<SyncJob | null>;
  complete(plaidItemId: string): Promise<void>;
  fail(plaidItemId: string, error: string): Promise<void>;
}
