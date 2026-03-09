import { Body, Controller, Get, Put, Param, Query, Inject, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { ListUnpaidDuesUseCase } from '@application/fee/use-cases/list-unpaid-dues.usecase';
import type { ListPaidDuesUseCase } from '@application/fee/use-cases/list-paid-dues.usecase';
import type { GetStudentFeesUseCase } from '@application/fee/use-cases/get-student-fees.usecase';
import type { MarkFeePaidUseCase } from '@application/fee/use-cases/mark-fee-paid.usecase';
import { FeesMonthQueryDto, StudentFeeRangeQueryDto } from './dto/fee.query';
import { MarkFeePaidBodyDto } from './dto/mark-fee-paid.dto';
import { mapResultToResponse } from '../common/result-mapper';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { Request } from 'express';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller('fees')
@UseGuards(JwtAuthGuard, RbacGuard)
export class FeesController {
  constructor(
    @Inject('LIST_UNPAID_DUES_USE_CASE')
    private readonly listUnpaidDues: ListUnpaidDuesUseCase,
    @Inject('LIST_PAID_DUES_USE_CASE')
    private readonly listPaidDues: ListPaidDuesUseCase,
    @Inject('GET_STUDENT_FEES_USE_CASE')
    private readonly getStudentFees: GetStudentFeesUseCase,
    @Inject('MARK_FEE_PAID_USE_CASE')
    private readonly markFeePaid: MarkFeePaidUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  @Get('dues')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List unpaid fee dues for a month' })
  async getDues(
    @Query() query: FeesMonthQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listUnpaidDues.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    return mapResultToResponse(result, req);
  }

  @Get('paid')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List paid fee dues for a month' })
  async getPaid(
    @Query() query: FeesMonthQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listPaidDues.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    return mapResultToResponse(result, req);
  }

  @Get('students/:studentId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get fee history for a student' })
  async getStudentHistory(
    @Param('studentId') studentId: string,
    @Query() query: StudentFeeRangeQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getStudentFees.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      from: query.from,
      to: query.to,
    });

    return mapResultToResponse(result, req);
  }

  @Put('students/:studentId/:month/pay')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Mark a fee due as paid (owner only)' })
  async pay(
    @Param('studentId') studentId: string,
    @Param('month') month: string,
    @Body() body: MarkFeePaidBodyDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.markFeePaid.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      monthKey: month,
      paymentLabel: body.paymentLabel,
    });

    if (result.ok) {
      this.logger.info('Fee marked as paid', {
        studentId,
        month,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }
}
