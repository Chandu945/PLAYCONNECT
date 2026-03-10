import type { PushSenderPort, PushMessage } from './ports/push-sender.port';
import type { DeviceTokenRepository } from '@domain/notification/ports/device-token.repository';
import type { LoggerPort } from '@shared/logging/logger.port';

export class PushNotificationService {
  constructor(
    private readonly pushSender: PushSenderPort,
    private readonly deviceTokenRepo: DeviceTokenRepository,
    private readonly logger: LoggerPort,
  ) {}

  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    await this.sendToUsers([userId], message);
  }

  async sendToUsers(userIds: string[], message: PushMessage): Promise<void> {
    if (userIds.length === 0) return;

    const deviceTokens = await this.deviceTokenRepo.findByUserIds(userIds);
    if (deviceTokens.length === 0) {
      this.logger.debug('Push: no device tokens found', { userIds });
      return;
    }

    const tokens = deviceTokens.map((dt) => dt.fcmToken);
    const failedTokens = await this.pushSender.sendToTokens(tokens, message);

    // Clean up invalid tokens
    if (failedTokens.length > 0) {
      this.logger.info(`Push: cleaning ${failedTokens.length} stale tokens`);
      await Promise.allSettled(
        failedTokens.map((token) => this.deviceTokenRepo.removeByToken(token)),
      );
    }
  }
}
