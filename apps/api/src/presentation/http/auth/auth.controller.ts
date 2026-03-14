import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { OwnerSignupUseCase } from '@application/identity/use-cases/owner-signup.usecase';
import { LoginUseCase } from '@application/identity/use-cases/login.usecase';
import { RefreshUseCase } from '@application/identity/use-cases/refresh.usecase';
import { LogoutUseCase } from '@application/identity/use-cases/logout.usecase';
import { LogoutAllUseCase } from '@application/identity/use-cases/logout-all.usecase';
import { RequestPasswordResetUseCase } from '@application/identity/use-cases/request-password-reset.usecase';
import { ConfirmPasswordResetUseCase } from '@application/identity/use-cases/confirm-password-reset.usecase';
import { OwnerSignupDto } from './dto/owner-signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleLoginUseCase } from '@application/identity/use-cases/google-login.usecase';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import { UseGuards } from '@nestjs/common';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { mapResultToResponse } from '../common/result-mapper';

@ApiTags('Auth')
@Controller('auth')
@Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 40, ttl: 60_000 }, long: { limit: 200, ttl: 900_000 } })
export class AuthController {
  constructor(
    @Inject('OWNER_SIGNUP_USE_CASE') private readonly ownerSignup: OwnerSignupUseCase,
    @Inject('LOGIN_USE_CASE') private readonly login: LoginUseCase,
    @Inject('REFRESH_USE_CASE') private readonly refresh: RefreshUseCase,
    @Inject('LOGOUT_USE_CASE') private readonly logout: LogoutUseCase,
    @Inject('LOGOUT_ALL_USE_CASE') private readonly logoutAll: LogoutAllUseCase,
    @Inject('REQUEST_PASSWORD_RESET_USE_CASE')
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
    @Inject('CONFIRM_PASSWORD_RESET_USE_CASE')
    private readonly confirmPasswordReset: ConfirmPasswordResetUseCase,
    @Inject('GOOGLE_LOGIN_USE_CASE') private readonly googleLoginUseCase: GoogleLoginUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  @Post('owner/signup')
  @Public()
  @Throttle({ short: { limit: 5, ttl: 10_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 900_000 } })
  @ApiOperation({ summary: 'Owner signup (Step 1)' })
  async signup(@Body() dto: OwnerSignupDto, @Req() req: Request) {
    const result = await this.ownerSignup.execute({
      fullName: dto.fullName,
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      password: dto.password,
      deviceId: dto.deviceId,
    });

    if (result.ok) {
      this.logger.info('Owner signup success', {
        userId: result.value.user.id,
        role: result.value.user.role,
      });
    }

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 10_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 100, ttl: 900_000 } })
  @ApiOperation({ summary: 'Login with email or phone' })
  async loginHandler(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.login.execute({
      identifier: dto.identifier,
      password: dto.password,
      deviceId: dto.deviceId,
    });

    if (result.ok) {
      this.logger.info('Login success', {
        userId: result.value.user.id,
        role: result.value.user.role,
      });
    } else {
      this.logger.warn('Login failure', { reason: result.error.code });
    }

    return mapResultToResponse(result, req);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 10_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 60, ttl: 900_000 } })
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshHandler(@Body() dto: RefreshDto, @Req() req: Request) {
    const result = await this.refresh.execute({
      refreshToken: dto.refreshToken,
      deviceId: dto.deviceId,
      userId: dto.userId,
    });

    if (!result.ok) {
      this.logger.warn('Refresh failure', { reason: result.error.code });
    }

    return mapResultToResponse(result, req);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout (revoke session)' })
  async logoutHandler(
    @Body() dto: LogoutDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.logout.execute({
      userId: user.userId,
      deviceId: dto.deviceId,
    });

    return mapResultToResponse(result, req);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout from all devices (revoke all sessions)' })
  async logoutAllHandler(
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.logoutAll.execute({
      userId: user.userId,
    });

    return mapResultToResponse(result, req);
  }

  @Post('password-reset/request')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 10_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 900_000 } })
  @ApiOperation({ summary: 'Request password reset OTP' })
  async requestPasswordResetHandler(
    @Body() dto: RequestPasswordResetDto,
    @Req() req: Request,
  ) {
    const result = await this.requestPasswordReset.execute({ email: dto.email });
    return mapResultToResponse(result, req);
  }

  @Post('password-reset/confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 10_000 }, medium: { limit: 15, ttl: 60_000 }, long: { limit: 50, ttl: 900_000 } })
  @ApiOperation({ summary: 'Confirm password reset with OTP' })
  async confirmPasswordResetHandler(
    @Body() dto: ConfirmPasswordResetDto,
    @Req() req: Request,
  ) {
    const result = await this.confirmPasswordReset.execute({
      email: dto.email,
      otp: dto.otp,
      newPassword: dto.newPassword,
    });
    return mapResultToResponse(result, req);
  }

  @Post('google')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 10_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 100, ttl: 900_000 } })
  @ApiOperation({ summary: 'Login with Google ID token' })
  async googleLogin(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    const result = await this.googleLoginUseCase.execute({
      idToken: dto.idToken,
      deviceId: dto.deviceId,
    });

    if (result.ok) {
      this.logger.info('Google login success', {
        userId: result.value.user.id,
        role: result.value.user.role,
      });
    } else {
      this.logger.warn('Google login failure', { reason: result.error.code });
    }

    return mapResultToResponse(result, req);
  }
}
