import { Injectable, type OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { AppConfigService } from '@shared/config/config.service';
import type { PushSenderPort, PushMessage } from '@application/notifications/ports/push-sender.port';
import { LoggerPort, LOGGER_PORT } from '@shared/logging/logger.port';
import { Inject } from '@nestjs/common';

@Injectable()
export class FirebasePushSender implements PushSenderPort, OnModuleInit {
  constructor(
    private readonly config: AppConfigService,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  onModuleInit(): void {
    if (admin.apps.length > 0) return;

    const projectId = this.config.firebaseProjectId;
    if (!projectId) {
      this.logger.warn('Firebase project ID not configured — push notifications disabled');
      return;
    }

    const serviceAccountJson = this.config.firebaseServiceAccountJson;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      // Use Application Default Credentials (ADC) in Cloud environments
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
    }

    this.logger.info('Firebase Admin SDK initialized for push notifications');
  }

  async sendToTokens(tokens: string[], message: PushMessage): Promise<string[]> {
    if (tokens.length === 0 || admin.apps.length === 0) return [];

    const failedTokens: string[] = [];

    const payload: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: message.data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'playconnect_default',
          sound: 'default',
        },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(payload);

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          const token = tokens[idx];
          // Collect tokens that are invalid/unregistered for cleanup
          if (
            token &&
            (errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered')
          ) {
            failedTokens.push(token);
          }
          this.logger.warn(`Push send failed for token index ${idx}: ${errorCode ?? 'unknown'}`);
        }
      });

      this.logger.info(
        `Push sent: ${response.successCount} success, ${response.failureCount} failures out of ${tokens.length}`,
      );
    } catch (error) {
      this.logger.error(`Push multicast failed: ${error}`);
    }

    return failedTokens;
  }
}
