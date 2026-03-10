import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeviceTokensController } from './device-tokens.controller';
import { AuthModule } from '../auth/auth.module';
import {
  DeviceTokenModel,
  DeviceTokenSchema,
} from '@infrastructure/database/schemas/device-token.schema';
import { MongoDeviceTokenRepository } from '@infrastructure/repositories/mongo-device-token.repository';
import { DEVICE_TOKEN_REPOSITORY } from '@domain/notification/ports/device-token.repository';
import type { DeviceTokenRepository } from '@domain/notification/ports/device-token.repository';
import { PUSH_SENDER_PORT } from '@application/notifications/ports/push-sender.port';
import type { PushSenderPort } from '@application/notifications/ports/push-sender.port';
import { FirebasePushSender } from '@infrastructure/notifications/firebase-push-sender';
import { PushNotificationService } from '@application/notifications/push-notification.service';
import type { LoggerPort } from '@shared/logging/logger.port';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import { MongoDbModule } from '@infrastructure/database/mongodb.module';

export const PUSH_NOTIFICATION_SERVICE = Symbol('PUSH_NOTIFICATION_SERVICE');

@Module({
  imports: [
    AuthModule,
    MongoDbModule.register(),
    MongooseModule.forFeature([
      { name: DeviceTokenModel.name, schema: DeviceTokenSchema },
    ]),
  ],
  controllers: [DeviceTokensController],
  providers: [
    { provide: DEVICE_TOKEN_REPOSITORY, useClass: MongoDeviceTokenRepository },
    { provide: PUSH_SENDER_PORT, useClass: FirebasePushSender },
    {
      provide: PUSH_NOTIFICATION_SERVICE,
      useFactory: (
        pushSender: PushSenderPort,
        deviceTokenRepo: DeviceTokenRepository,
        logger: LoggerPort,
      ) => new PushNotificationService(pushSender, deviceTokenRepo, logger),
      inject: [PUSH_SENDER_PORT, DEVICE_TOKEN_REPOSITORY, LOGGER_PORT],
    },
  ],
  exports: [DEVICE_TOKEN_REPOSITORY, PUSH_SENDER_PORT, PUSH_NOTIFICATION_SERVICE],
})
export class DeviceTokensModule {}
