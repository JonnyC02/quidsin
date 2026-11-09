import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmEncryptionService } from '../ports/encryption-service.js';

describe('AesGcmEncryptionService', () => {
  it('round-trips plaintext through encrypt/decrypt', async () => {
    const service = new AesGcmEncryptionService(randomBytes(32));
    const payload = await service.encrypt('access-sandbox-secret-token');

    expect(await service.decrypt(payload)).toBe('access-sandbox-secret-token');
  });

  it('never stores the plaintext in any field of the payload', async () => {
    const service = new AesGcmEncryptionService(randomBytes(32));
    const plaintext = 'access-sandbox-secret-token';
    const payload = await service.encrypt(plaintext);

    expect(payload.ciphertext).not.toContain(plaintext);
    expect(JSON.stringify(payload)).not.toContain(plaintext);
  });

  it('uses a different IV (and ciphertext) on every call, even for the same plaintext', async () => {
    const service = new AesGcmEncryptionService(randomBytes(32));
    const first = await service.encrypt('same-value');
    const second = await service.encrypt('same-value');

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('fails to decrypt with the wrong key', async () => {
    const service = new AesGcmEncryptionService(randomBytes(32));
    const payload = await service.encrypt('access-sandbox-secret-token');

    const wrongKeyService = new AesGcmEncryptionService(randomBytes(32));
    await expect(wrongKeyService.decrypt(payload)).rejects.toThrow();
  });

  it('fails to decrypt a tampered ciphertext (GCM auth tag catches it)', async () => {
    const service = new AesGcmEncryptionService(randomBytes(32));
    const payload = await service.encrypt('access-sandbox-secret-token');

    const tampered = { ...payload, ciphertext: Buffer.from('tampered-bytes!!').toString('base64') };
    await expect(service.decrypt(tampered)).rejects.toThrow();
  });
});
