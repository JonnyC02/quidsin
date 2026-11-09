import type { EncryptedPayload, EncryptionService } from '@quidsin/core';

export interface KmsEncryptionServiceOptions {
  keyId: string;
}

/**
 * Stub seam for the real AWS KMS-backed encryption service, implemented
 * when the SAM/Lambda deployment phase actually targets AWS. Mirrors
 * DynamoDbAwsAdapter's unwired-stub treatment.
 */
export class KmsEncryptionService implements EncryptionService {
  constructor(private readonly options: KmsEncryptionServiceOptions) {}

  async encrypt(_plaintext: string): Promise<EncryptedPayload> {
    throw new Error(`Not implemented (keyId: ${this.options.keyId})`);
  }

  async decrypt(_payload: EncryptedPayload): Promise<string> {
    throw new Error(`Not implemented (keyId: ${this.options.keyId})`);
  }
}
