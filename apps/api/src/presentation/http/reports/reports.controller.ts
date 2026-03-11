import {
  Controller,
  Get,
  Query,
  Inject,
  UseGuards,
  Req,
  Res,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { GetStudentWiseDuesReportUseCase } from '@application/reports/use-cases/get-student-wise-dues-report.usecase';
import type { GetMonthWiseDuesReportUseCase } from '@application/reports/use-cases/get-month-wise-dues-report.usecase';
import type { GetMonthlyRevenueReportUseCase } from '@application/reports/use-cases/get-monthly-revenue-report.usecase';
import type { ExportMonthlyRevenuePdfUseCase } from '@application/reports/use-cases/export-monthly-revenue-pdf.usecase';
import type { ExportPendingDuesPdfUseCase } from '@application/reports/use-cases/export-pending-dues-pdf.usecase';
import { ReportsMonthQueryDto } from './dto/reports.query';
import { mapResultToResponse } from '../common/result-mapper';
import type { Request, Response } from 'express';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RbacGuard)
@Throttle({ short: { limit: 15, ttl: 10_000 }, medium: { limit: 60, ttl: 60_000 }, long: { limit: 300, ttl: 900_000 } })
export class ReportsController {
  constructor(
    @Inject('GET_STUDENT_WISE_DUES_REPORT_USE_CASE')
    private readonly getStudentWiseDuesReport: GetStudentWiseDuesReportUseCase,
    @Inject('GET_MONTH_WISE_DUES_REPORT_USE_CASE')
    private readonly getMonthWiseDuesReport: GetMonthWiseDuesReportUseCase,
    @Inject('GET_MONTHLY_REVENUE_REPORT_USE_CASE')
    private readonly getMonthlyRevenueReport: GetMonthlyRevenueReportUseCase,
    @Inject('EXPORT_MONTHLY_REVENUE_PDF_USE_CASE')
    private readonly exportRevenuePdf: ExportMonthlyRevenuePdfUseCase,
    @Inject('EXPORT_PENDING_DUES_PDF_USE_CASE')
    private readonly exportDuesPdf: ExportPendingDuesPdfUseCase,
  ) {}

  @Get('student-wise-dues')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Student-wise dues report for a month' })
  async studentWiseDues(
    @Query() query: ReportsMonthQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getStudentWiseDuesReport.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    return mapResultToResponse(result, req);
  }

  @Get('month-wise-dues')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Month-wise dues summary for a month' })
  async monthWiseDues(
    @Query() query: ReportsMonthQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getMonthWiseDuesReport.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    return mapResultToResponse(result, req);
  }

  @Get('monthly-revenue')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Monthly revenue report from transaction logs' })
  async monthlyRevenue(
    @Query() query: ReportsMonthQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getMonthlyRevenueReport.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    return mapResultToResponse(result, req);
  }

  @Get('revenue/export.pdf')
  @Roles('OWNER')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Export monthly revenue as PDF' })
  async exportRevenue(
    @Query() query: ReportsMonthQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportRevenuePdf.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    if (!result.ok) {
      return mapResultToResponse(result, req);
    }

    res.setHeader('Content-Disposition', `attachment; filename="revenue-${query.month}.pdf"`);
    return new StreamableFile(result.value);
  }

  @Get('dues/pending/export.pdf')
  @Roles('OWNER')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({ summary: 'Export pending dues as PDF' })
  async exportPendingDues(
    @Query() query: ReportsMonthQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.exportDuesPdf.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    if (!result.ok) {
      return mapResultToResponse(result, req);
    }

    res.setHeader('Content-Disposition', `attachment; filename="pending-dues-${query.month}.pdf"`);
    return new StreamableFile(result.value);
  }
}
