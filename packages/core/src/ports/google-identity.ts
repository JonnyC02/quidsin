export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Verifies a Google-signed ID token (obtained by the frontend's Google
 * Identity Services sign-in button) and extracts the claims we care
 * about. Implemented in apps/api/src/infra using google-auth-library —
 * this port exists so packages/core stays free of that dependency.
 * Must throw if the token's signature, audience, issuer, or expiry fail
 * verification.
 */
export interface GoogleIdentityVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}
