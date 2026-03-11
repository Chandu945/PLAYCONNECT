import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Inject,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { GetAdminDashboardUseCase } from '@application/admin/use-cases/get-admin-dashboard.usecase';
import type { ListAcademiesUseCase } from '@application/admin/use-cases/list-academies.usecase';
import type { GetAcademyDetailUseCase } from '@application/admin/use-cases/get-academy-detail.usecase';
import type { SetSubscriptionManualUseCase } from '@application/admin/use-cases/set-subscription-manual.usecase';
import type { DeactivateSubscriptionUseCase } from '@application/admin/use-cases/deactivate-subscription.usecase';
import type { SetAcademyLoginDisabledUseCase } from '@application/admin/use-cases/set-academy-login-disabled.usecase';
import type { ForceLogoutAcademyUseCase } from '@application/admin/use-cases/force-logout-academy.usecase';
import type { ResetOwnerPasswordUseCase } from '@application/admin/use-cases/reset-owner-password.usecase';
import type { ListAcademyAuditLogsUseCase } from '@application/admin/use-cases/list-academy-audit-logs.usecase';
import { ListAcademiesQueryDto, AdminAuditLogsQueryDto } from './dto/admin.query';
import {
  SetSubscriptionManualDto,
  DeactivateSubscriptionDto,
  SetLoginDisabledDto,
} from './dto/admin.actions.dto';
import { mapResultToResponse } from '../common/result-mapper';
import type { Request } from 'express';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles('SUPER_ADMIN')
@Throttle({ short: { limit: 40, ttl: 10_000 }, medium: { limit: 150, ttl: 60_000 }, long: { limit: 800, ttl: 900_000 } })
export class AdminController {
  constructor(
    @Inject('GET_ADMIN_DASHBOARD_USE_CASE')
    private readonly getDashboard: GetAdminDashboardUseCase,
    @Inject('LIST_ACADEMIES_USE_CASE')
    private readonly listAcademies: ListAcademiesUseCase,
    @Inject('GET_ACADEMY_DETAIL_USE_CASE')
    private readonly getAcademyDetail: GetAcademyDetailUseCase,
    @Inject('SET_SUBSCRIPTION_MANUAL_USE_CASE')
    private readonly setSubscriptionManual: SetSubscriptionManualUseCase,
    @Inject('DEACTIVATE_SUBSCRIPTION_USE_CASE')
    private readonly deactivateSubscription: DeactivateSubscriptionUseCase,
    @Inject('SET_ACADEMY_LOGIN_DISABLED_USE_CASE')
    private readonly setLoginDisabled: SetAcademyLoginDisabledUseCase,
    @Inject('FORCE_LOGOUT_ACADEMY_USE_CASE')
    private readonly forceLogout: ForceLogoutAcademyUseCase,
    @Inject('RESET_OWNER_PASSWORD_USE_CASE')
    private readonly resetPassword: ResetOwnerPasswordUseCase,
    @Inject('LIST_ACADEMY_AUDIT_LOGS_USE_CASE')
    private readonly listAuditLogs: ListAcademyAuditLogsUseCase,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Admin dashboard tiles' })
  async dashboard(@CurrentUser() user: CurrentUserType, @Req() req: Request) {
    const result = await this.getDashboard.execute({ actorRole: user.role });
    return mapResultToResponse(result, req);
  }

  @Get('academies')
  @ApiOperation({ summary: 'List all academies' })
  async academies(
    @Query() query: ListAcademiesQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listAcademies.execute({
      actorRole: user.role,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      search: query.search,
      tierKey: query.tierKey,
    });
    return mapResultToResponse(result, req);
  }

  @Get('academies/:academyId')
  @ApiOperation({ summary: 'Get academy detail' })
  async academyDetail(
    @Param('academyId') academyId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getAcademyDetail.execute({
      actorRole: user.role,
      academyId,
    });
    return mapResultToResponse(result, req);
  }

  @Put('academies/:academyId/subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set subscription manually' })
  async setSubscription(
    @Param('academyId') academyId: string,
    @Body() dto: SetSubscriptionManualDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.setSubscriptionManual.execute({
      actorRole: user.role,
      academyId,
      paidStartAt: dto.paidStartAt,
      paidEndAt: dto.paidEndAt,
      tierKey: dto.tierKey,
      paymentReference: dto.paymentReference,
      manualNotes: dto.manualNotes,
    });
    return mapResultToResponse(result, req);
  }

  @Post('academies/:academyId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate subscription' })
  async deactivate(
    @Param('academyId') academyId: string,
    @Body() dto: DeactivateSubscriptionDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.deactivateSubscription.execute({
      actorRole: user.role,
      academyId,
      manualNotes: dto.manualNotes,
    });
    return mapResultToResponse(result, req);
  }

  @Put('academies/:academyId/login-disabled')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable/disable academy login' })
  async loginDisabled(
    @Param('academyId') academyId: string,
    @Body() dto: SetLoginDisabledDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.setLoginDisabled.execute({
      actorRole: user.role,
      academyId,
      disabled: dto.disabled,
    });
    return mapResultToResponse(result, req);
  }

  @Post('academies/:academyId/force-logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force logout all users of an academy' })
  async forceLogoutHandler(
    @Param('academyId') academyId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.forceLogout.execute({
      actorRole: user.role,
      academyId,
    });
    return mapResultToResponse(result, req);
  }

  @Post('academies/:academyId/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset owner password for an academy' })
  async resetPasswordHandler(
    @Param('academyId') academyId: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.resetPassword.execute({
      actorRole: user.role,
      academyId,
    });
    return mapResultToResponse(result, req);
  }

  @Get('academies/:academyId/audit-logs')
  @ApiOperation({ summary: 'List audit logs for an academy' })
  async auditLogs(
    @Param('academyId') academyId: string,
    @Query() query: AdminAuditLogsQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listAuditLogs.execute({
      actorRole: user.role,
      academyId,
      page: query.page,
      pageSize: query.pageSize,
      from: query.from,
      to: query.to,
      action: query.action,
      entityType: query.entityType,
    });
    return mapResultToResponse(result, req);
  }
}
