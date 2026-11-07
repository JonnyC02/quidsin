import type { User } from '../domain/entities/user.js';
import type { Tenant } from '../domain/entities/tenant.js';

export interface RegisterUserInput {
  email: string;
  passwordHash: string;
  name?: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /**
   * Atomically creates the user, their personal tenant, and the email
   * uniqueness lock. Throws ConflictError if the email is already taken.
   */
  register(input: RegisterUserInput): Promise<{ user: User; tenant: Tenant }>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  /** Deletes only the user + email-lock + tenant rows (not their domain records). */
  delete(userId: string, tenantId: string): Promise<void>;
}
