import type { Session } from '../domain/entities/session.js';

export interface NewSession {
  id: string;
  userId: string;
  tenantId: string;
  expiresAt: string;
  createdAt: string;
}

export interface SessionRepository {
  create(session: NewSession): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  /** Sliding renewal — extends the session's expiry. */
  touch(id: string, expiresAt: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}
