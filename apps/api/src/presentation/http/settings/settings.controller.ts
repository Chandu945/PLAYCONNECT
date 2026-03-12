import { Controller, Get, Put, Body, Inject, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { GetAcademySettingsUseCase } from '@application/academy/use-cases/get-academy-settings.usecase';
import type { UpdateAcademySettingsUseCase } from '@application/academy/use-cases/update-academy-settings.usecase';
import { UpdateAcademySettingsDto } from './dto/update-academy-settings.dto';
import { mapResultToResponse } from '../common/result-mapper';
import type { Request } from 'express';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard, RbacGuard)
export class SettingsController {
  constructor(
    @Inject('GET_ACADEMY_SETTINGS_USE_CASE')
    private readonly getAcademySettings: GetAcademySettingsUseCase,
    @Inject('UPDATE_ACADEMY_SETTINGS_USE_CASE')
    private readonly updateAcademySettings: UpdateAcademySettingsUseCase,
  ) {}

  @Get('academy')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get academy settings' })
  async getSettings(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.getAcademySettings.execute({
      actorUserId: user.userId,
      actorRole: user.role,
    });

    return mapResultToResponse(result, req);
  }

  @Put('academy')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Update academy settings (owner only)' })
  async updateSettings(
    @Body() dto: UpdateAcademySettingsDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.updateAcademySettings.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      defaultDueDateDay: dto.defaultDueDateDay,
      receiptPrefix: dto.receiptPrefix,
      lateFeeEnabled: dto.lateFeeEnabled,
      gracePeriodDays: dto.gracePeriodDays,
      lateFeeAmountInr: dto.lateFeeAmountInr,
      lateFeeRepeatIntervalDays: dto.lateFeeRepeatIntervalDays,
    });

    return mapResultToResponse(result, req);
  }
}
