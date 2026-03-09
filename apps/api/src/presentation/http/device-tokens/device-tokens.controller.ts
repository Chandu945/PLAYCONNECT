import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { DeviceTokenRepository } from '@domain/notification/ports/device-token.repository';
import { DEVICE_TOKEN_REPOSITORY } from '@domain/notification/ports/device-token.repository';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import { getRequestId } from '@shared/logging/request-id.interceptor';

class RegisterTokenDto {
  fcmToken!: string;
  platform!: string;
}

class UnregisterTokenDto {
  fcmToken!: string;
}

@ApiTags('Device Tokens')
@ApiBearerAuth()
@Controller('device-tokens')
@UseGuards(JwtAuthGuard)
export class DeviceTokensController {
  constructor(
    @Inject(DEVICE_TOKEN_REPOSITORY)
    private readonly deviceTokenRepo: DeviceTokenRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async register(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: RegisterTokenDto,
    @Req() req: Request,
  ) {
    await this.deviceTokenRepo.upsert(user.userId, dto.fcmToken, dto.platform);
    return {
      success: true,
      data: null,
      requestId: getRequestId(req),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('unregister')
  @HttpCode(HttpStatus.OK)
  async unregister(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: UnregisterTokenDto,
    @Req() req: Request,
  ) {
    await this.deviceTokenRepo.removeByUserIdAndToken(user.userId, dto.fcmToken);
    return {
      success: true,
      data: null,
      requestId: getRequestId(req),
      timestamp: new Date().toISOString(),
    };
  }
}
