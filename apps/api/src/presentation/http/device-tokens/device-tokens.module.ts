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
import { PUSH_SENDER_PORT } from '@application/notifications/ports/push-sender.port';
import { FirebasePushSender } from '@infrastructure/notifications/firebase-push-sender';
import { MongoDbModule } from '@infrastructure/database/mongodb.module';

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
  ],
  exports: [DEVICE_TOKEN_REPOSITORY, PUSH_SENDER_PORT],
})
export class DeviceTokensModule {}
