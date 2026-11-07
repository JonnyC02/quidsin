import type { PasswordResetToken } from '../domain/entities/password-reset-token.js';

export interface NewPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface PasswordResetTokenRepository {
  create(token: NewPasswordResetToken): Promise<PasswordResetToken>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  markUsed(tokenHash: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}
