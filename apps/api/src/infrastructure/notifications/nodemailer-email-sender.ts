import { Injectable, Inject, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type {
  EmailSenderPort,
  EmailMessage,
} from '@application/notifications/ports/email-sender.port';
import type { ExternalCallPolicyPort } from '@application/common/ports/external-call-policy.port';
import { EXTERNAL_CALL_POLICY } from '@application/common/ports/external-call-policy.port';
import { AppConfigService } from '@shared/config/config.service';
import type { LoggerPort } from '@shared/logging/logger.port';
import { LOGGER_PORT } from '@shared/logging/logger.port';

const SMTP_TIMEOUT_MS = 10_000;

@Injectable()
export class NodemailerEmailSender implements EmailSenderPort {
  private readonly transport: nodemailer.Transporter;

  constructor(
    private readonly config: AppConfigService,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
    @Optional() @Inject(EXTERNAL_CALL_POLICY) private readonly callPolicy?: ExternalCallPolicyPort,
  ) {
    this.transport = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
      connectionTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  async send(message: EmailMessage): Promise<boolean> {
    if (this.config.emailDryRun) {
      this.logger.info('Email DRY_RUN: would send', {
        to: message.to,
        subject: message.subject,
      });
      return true;
    }

    try {
      if (this.callPolicy) {
        await this.callPolicy.run(
          'smtp.send',
          () => this.doSend(message),
          {
            timeoutMs: SMTP_TIMEOUT_MS,
            retries: 3,
            retryBackoffMs: 1000,
            idempotent: false,
          },
        );
      } else {
        await this.doSend(message);
      }

      return true;
    } catch (error) {
      this.logger.error('Email send failed', {
        to: message.to,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async doSend(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.config.smtpFrom,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
