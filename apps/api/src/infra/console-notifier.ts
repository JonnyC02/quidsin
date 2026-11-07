import type { Notifier, SendPasswordResetEmailInput } from '@quidsin/core';

/**
 * Logs the password reset link instead of sending an email. The default
 * notifier for self-hosted/dev use — no SMTP configuration required.
 */
export class ConsoleNotifier implements Notifier {
  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    console.log(
      `[notifier] Password reset requested for ${input.to}. Link (expires ${input.expiresAt.toISOString()}): ${input.resetUrl}`,
    );
  }
}
