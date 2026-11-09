import { OAuth2Client } from 'google-auth-library';
import {
  InvalidCredentialsError,
  type GoogleIdentity,
  type GoogleIdentityVerifier,
} from '@quidsin/core';

export class GoogleAuthLibraryIdentityVerifier implements GoogleIdentityVerifier {
  private readonly client: OAuth2Client;

  constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    let ticket;
    try {
      ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
    } catch {
      throw new InvalidCredentialsError('Invalid Google credential');
    }

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new InvalidCredentialsError('Invalid Google credential');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      name: payload.name,
    };
  }
}
