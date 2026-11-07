import nodemailer from 'nodemailer';
import type { Notifier, SendPasswordResetEmailInput } from '@quidsin/core';

export interface SmtpNotifierOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
}

export class SmtpNotifier implements Notifier {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly options: SmtpNotifierOptions) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: { user: options.user, pass: options.password },
    });
  }

  async sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.options.fromAddress,
      to: input.to,
      subject: 'Reset your QuidsIn password',
      text: `Reset your password: ${input.resetUrl}\n\nThis link expires at ${input.expiresAt.toISOString()}.`,
    });
  }
}
