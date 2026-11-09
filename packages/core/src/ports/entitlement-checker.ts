export type GatedFeature = 'bank_connections';

export interface EntitlementChecker {
  canUseFeature(tenantId: string, feature: GatedFeature): Promise<boolean>;
}

/**
 * Community Edition default — every feature is always allowed. The
 * private hosted edition supplies its own Stripe-backed implementation
 * and wires it in only in its own deployment; this package never
 * depends on Stripe or knows billing exists.
 */
export class AllowAllEntitlementChecker implements EntitlementChecker {
  async canUseFeature(): Promise<boolean> {
    return true;
  }
}
