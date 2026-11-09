export interface User {
  /** Google's `sub` claim — stable, permanent, globally unique. */
  id: string;
  email: string;
  tenantId: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}
