import { Controller, Post, Body, HttpStatus, Inject, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SetupAcademyUseCase } from '@application/academy/use-cases/setup-academy.usecase';
import { SetupAcademyDto } from './dto/setup-academy.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import { mapResultToResponse } from '../common/result-mapper';

@ApiTags('Academy Onboarding')
@Controller('academy')
export class AcademyOnboardingController {
  constructor(
    @Inject('SETUP_ACADEMY_USE_CASE') private readonly setupAcademy: SetupAcademyUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  @Post('setup')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @Throttle({ short: { limit: 10, ttl: 10_000 }, medium: { limit: 20, ttl: 60_000 }, long: { limit: 60, ttl: 900_000 } })
  @ApiOperation({ summary: 'Academy setup (Step 2 — Owner only, once)' })
  async setup(
    @Body() dto: SetupAcademyDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.setupAcademy.execute({
      ownerUserId: user.userId,
      ownerRole: user.role,
      academyName: dto.academyName,
      address: dto.address,
    });

    if (result.ok) {
      this.logger.info('Academy setup created', {
        academyId: result.value.id,
        ownerId: user.userId,
      });
    }

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }
}
