export interface SendPasswordResetEmailInput {
  to: string;
  resetUrl: string;
  expiresAt: Date;
}

export interface Notifier {
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void>;
}
