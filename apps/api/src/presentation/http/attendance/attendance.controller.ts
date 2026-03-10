import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  Inject,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RbacGuard } from '../common/guards/rbac.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUser as CurrentUserType } from '@application/common/current-user';
import type { GetDailyAttendanceViewUseCase } from '@application/attendance/use-cases/get-daily-attendance-view.usecase';
import type { MarkStudentAttendanceUseCase } from '@application/attendance/use-cases/mark-student-attendance.usecase';
import type { BulkSetAbsencesUseCase } from '@application/attendance/use-cases/bulk-set-absences.usecase';
import type { DeclareHolidayUseCase } from '@application/attendance/use-cases/declare-holiday.usecase';
import type { RemoveHolidayUseCase } from '@application/attendance/use-cases/remove-holiday.usecase';
import type { ListHolidaysUseCase } from '@application/attendance/use-cases/list-holidays.usecase';
import type { GetDailyAttendanceReportUseCase } from '@application/attendance/use-cases/get-daily-attendance-report.usecase';
import type { GetStudentMonthlyAttendanceUseCase } from '@application/attendance/use-cases/get-student-monthly-attendance.usecase';
import type { GetMonthlyAttendanceSummaryUseCase } from '@application/attendance/use-cases/get-monthly-attendance-summary.usecase';
import { AttendanceQueryDto, DateOnlyQueryDto } from './dto/attendance.query';
import { MarkStudentAttendanceDto } from './dto/mark-student-attendance.dto';
import { BulkSetAbsencesDto } from './dto/bulk-set-absences.dto';
import { DeclareHolidayDto } from './dto/declare-holiday.dto';
import { MonthlyQueryDto, MonthlyPaginatedQueryDto } from './dto/monthly.query';
import { mapResultToResponse } from '../common/result-mapper';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { PushNotificationService } from '@application/notifications/push-notification.service';
import { PUSH_NOTIFICATION_SERVICE } from '../device-tokens/device-tokens.module';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import { PARENT_STUDENT_LINK_REPOSITORY } from '@domain/parent/ports/parent-student-link.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import { STUDENT_REPOSITORY as STUDENT_REPO_TOKEN } from '@domain/student/ports/student.repository';
import type { Request } from 'express';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AttendanceController {
  constructor(
    @Inject('GET_DAILY_ATTENDANCE_VIEW_USE_CASE')
    private readonly getDailyAttendanceView: GetDailyAttendanceViewUseCase,
    @Inject('MARK_STUDENT_ATTENDANCE_USE_CASE')
    private readonly markStudentAttendance: MarkStudentAttendanceUseCase,
    @Inject('BULK_SET_ABSENCES_USE_CASE')
    private readonly bulkSetAbsences: BulkSetAbsencesUseCase,
    @Inject('DECLARE_HOLIDAY_USE_CASE')
    private readonly declareHoliday: DeclareHolidayUseCase,
    @Inject('REMOVE_HOLIDAY_USE_CASE')
    private readonly removeHoliday: RemoveHolidayUseCase,
    @Inject('LIST_HOLIDAYS_USE_CASE')
    private readonly listHolidays: ListHolidaysUseCase,
    @Inject('GET_DAILY_ATTENDANCE_REPORT_USE_CASE')
    private readonly getDailyAttendanceReport: GetDailyAttendanceReportUseCase,
    @Inject('GET_STUDENT_MONTHLY_ATTENDANCE_USE_CASE')
    private readonly getStudentMonthlyAttendance: GetStudentMonthlyAttendanceUseCase,
    @Inject('GET_MONTHLY_ATTENDANCE_SUMMARY_USE_CASE')
    private readonly getMonthlyAttendanceSummary: GetMonthlyAttendanceSummaryUseCase,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
    @Inject(PUSH_NOTIFICATION_SERVICE)
    private readonly pushService: PushNotificationService,
    @Inject(PARENT_STUDENT_LINK_REPOSITORY)
    private readonly parentLinkRepo: ParentStudentLinkRepository,
    @Inject(STUDENT_REPO_TOKEN)
    private readonly studentRepo: StudentRepository,
  ) {}

  // === Attendance view/marking ===

  @Get('students')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get daily attendance view for students' })
  async dailyView(
    @Query() query: AttendanceQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getDailyAttendanceView.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      date: query.date,
      page: query.page,
      pageSize: query.pageSize,
      batchId: query.batchId,
      search: query.search,
    });

    return mapResultToResponse(result, req);
  }

  @Put('students/bulk')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Set absent list for the day (replaces existing)' })
  async bulkAbsences(
    @Query() query: DateOnlyQueryDto,
    @Body() dto: BulkSetAbsencesDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.bulkSetAbsences.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      date: query.date,
      absentStudentIds: dto.absentStudentIds,
    });

    if (result.ok) {
      this.logger.info('Bulk absences set', {
        date: query.date,
        absentCount: result.value.absentCount,
        actorUserId: user.userId,
      });

      // Fire-and-forget push to parents of absent students
      if (dto.absentStudentIds.length > 0) {
        this.notifyParentsOfAbsence(dto.absentStudentIds, query.date).catch((pushErr) => {
          this.logger.warn('Push notification to parents failed', {
            error: pushErr instanceof Error ? pushErr.message : String(pushErr),
          });
        });
      }
    }

    return mapResultToResponse(result, req);
  }

  @Put('students/:studentId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Mark attendance for a single student' })
  async markOne(
    @Param('studentId') studentId: string,
    @Query() query: DateOnlyQueryDto,
    @Body() dto: MarkStudentAttendanceDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.markStudentAttendance.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      date: query.date,
      status: dto.status,
    });

    if (result.ok) {
      this.logger.info('Attendance marked', {
        studentId,
        date: query.date,
        status: dto.status,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  // === Holiday management ===

  @Post('holidays')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Declare a holiday (owner only)' })
  async declareHolidayEndpoint(
    @Body() dto: DeclareHolidayDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.declareHoliday.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      date: dto.date,
      reason: dto.reason,
    });

    if (result.ok) {
      this.logger.info('Holiday declared', {
        date: dto.date,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req, HttpStatus.CREATED);
  }

  @Delete('holidays/:date')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Remove a holiday (owner only)' })
  async removeHolidayEndpoint(
    @Param('date') date: string,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.removeHoliday.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      date,
    });

    if (result.ok) {
      this.logger.info('Holiday removed', {
        date,
        actorUserId: user.userId,
      });
    }

    return mapResultToResponse(result, req);
  }

  @Get('holidays')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'List holidays for a month' })
  async listHolidaysEndpoint(
    @Query() query: MonthlyQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.listHolidays.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
    });

    return mapResultToResponse(result, req);
  }

  // === Reports ===

  @Get('reports/daily')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get daily attendance report' })
  async dailyReport(
    @Query() query: DateOnlyQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getDailyAttendanceReport.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      date: query.date,
    });

    return mapResultToResponse(result, req);
  }

  @Get('reports/monthly/student/:studentId')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get monthly attendance for a specific student' })
  async monthlyStudent(
    @Param('studentId') studentId: string,
    @Query() query: MonthlyQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getStudentMonthlyAttendance.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      studentId,
      month: query.month,
    });

    return mapResultToResponse(result, req);
  }

  @Get('reports/monthly/summary')
  @Roles('OWNER', 'STAFF')
  @ApiOperation({ summary: 'Get monthly attendance summary for all students' })
  async monthlySummary(
    @Query() query: MonthlyPaginatedQueryDto,
    @CurrentUser() user: CurrentUserType,
    @Req() req: Request,
  ) {
    const result = await this.getMonthlyAttendanceSummary.execute({
      actorUserId: user.userId,
      actorRole: user.role,
      month: query.month,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
    });

    return mapResultToResponse(result, req);
  }

  private async notifyParentsOfAbsence(studentIds: string[], date: string): Promise<void> {
    const students = await this.studentRepo.findByIds(studentIds);
    const nameMap = new Map(students.map((s) => [s.id.toString(), s.fullName]));

    for (const studentId of studentIds) {
      const links = await this.parentLinkRepo.findByStudentId(studentId);
      if (links.length === 0) continue;

      const parentUserIds = links.map((l) => l.parentUserId);
      const studentName = nameMap.get(studentId) ?? 'Your child';

      await this.pushService
        .sendToUsers(parentUserIds, {
          title: 'Attendance Update',
          body: `${studentName} was marked absent on ${date}.`,
          data: { type: 'ATTENDANCE', studentId, date },
        })
        .catch((pushErr) => {
          this.logger.warn('Push notification to parent failed', {
            studentId,
            error: pushErr instanceof Error ? pushErr.message : String(pushErr),
          });
        });
    }
  }
}
