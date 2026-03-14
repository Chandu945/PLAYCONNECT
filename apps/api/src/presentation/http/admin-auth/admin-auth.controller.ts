import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import type { AdminLoginUseCase } from '@application/admin-auth/use-cases/admin-login.usecase';
import type { RefreshUseCase } from '@application/identity/use-cases/refresh.usecase';
import type { LogoutUseCase } from '@application/identity/use-cases/logout.usecase';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminRefreshDto } from './dto/admin-refresh.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import { mapResultToResponse } from '../common/result-mapper';
import type { Request } from 'express';

@ApiTags('Admin Auth')
@Controller('admin/auth')
@Throttle({ short: { limit: 10, ttl: 10_000 }, medium: { limit: 30, ttl: 60_000 }, long: { limit: 150, ttl: 900_000 } })
export class AdminAuthController {
  constructor(
    @Inject('ADMIN_LOGIN_USE_CASE')
    private readonly adminLogin: AdminLoginUseCase,
    @Inject('ADMIN_REFRESH_USE_CASE')
    private readonly refresh: RefreshUseCase,
    @Inject('ADMIN_LOGOUT_USE_CASE')
    private readonly logout: LogoutUseCase,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login' })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const result = await this.adminLogin.execute({
      email: dto.email,
      password: dto.password,
      deviceId: dto.deviceId,
    });
    return mapResultToResponse(result, req);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 10_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 60, ttl: 900_000 } })
  @ApiOperation({ summary: 'Admin refresh token' })
  async refreshHandler(@Body() dto: AdminRefreshDto, @Req() req: Request) {
    const result = await this.refresh.execute({
      refreshToken: dto.refreshToken,
      deviceId: dto.deviceId,
      userId: dto.userId,
    });
    return mapResultToResponse(result, req);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin logout' })
  async logoutHandler(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: AdminRefreshDto,
    @Req() req: Request,
  ) {
    const result = await this.logout.execute({
      userId: user.userId,
      deviceId: dto.deviceId,
    });
    return mapResultToResponse(result, req);
  }
}
