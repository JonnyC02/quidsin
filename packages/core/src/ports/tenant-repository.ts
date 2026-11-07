import type { Tenant } from '../domain/entities/tenant.js';

export interface TenantRepository {
  findById(id: string): Promise<Tenant | null>;
}
