import type { User } from '../domain/entities/user.js';
import type { Tenant } from '../domain/entities/tenant.js';

export interface GoogleProfile {
  googleSub: string;
  email: string;
  name?: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /**
   * Looks up the user by Google sub (== User.id); if this is the first
   * time this Google account has signed in, provisions the user and
   * their personal tenant.
   */
  findOrCreateByGoogleProfile(profile: GoogleProfile): Promise<{ user: User; tenant: Tenant }>;
  /** Deletes only the user + tenant rows (not their domain records). */
  delete(userId: string, tenantId: string): Promise<void>;
}
