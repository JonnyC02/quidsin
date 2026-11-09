import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedPayload } from '../domain/entities/plaid-item.js';

export interface EncryptionService {
  encrypt(plaintext: string): Promise<EncryptedPayload>;
  decrypt(payload: EncryptedPayload): Promise<string>;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

/**
 * AES-256-GCM using only node:crypto — no third-party dependency, same
 * category of "infra-free infra" as SystemClock/RandomUuidGenerator,
 * which already live in packages/core and already use node:crypto.
 */
export class AesGcmEncryptionService implements EncryptionService {
  /** `key` must be exactly 32 bytes (AES-256). */
  constructor(private readonly key: Buffer) {}

  async encrypt(plaintext: string): Promise<EncryptedPayload> {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  async decrypt(payload: EncryptedPayload): Promise<string> {
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
