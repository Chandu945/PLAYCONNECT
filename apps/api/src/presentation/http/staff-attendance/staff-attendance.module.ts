import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StaffAttendanceController } from './staff-attendance.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import {
  StaffAttendanceModel,
  StaffAttendanceSchema,
} from '@infrastructure/database/schemas/staff-attendance.schema';
import { HolidayModel, HolidaySchema } from '@infrastructure/database/schemas/holiday.schema';
import { MongoStaffAttendanceRepository } from '@infrastructure/repositories/mongo-staff-attendance.repository';
import { MongoHolidayRepository } from '@infrastructure/repositories/mongo-holiday.repository';
import { STAFF_ATTENDANCE_REPOSITORY } from '@domain/staff-attendance/ports/staff-attendance.repository';
import { HOLIDAY_REPOSITORY } from '@domain/attendance/ports/holiday.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { GetDailyStaffAttendanceViewUseCase } from '@application/staff-attendance/use-cases/get-daily-staff-attendance-view.usecase';
import { MarkStaffAttendanceUseCase } from '@application/staff-attendance/use-cases/mark-staff-attendance.usecase';
import { GetDailyStaffAttendanceReportUseCase } from '@application/staff-attendance/use-cases/get-daily-staff-attendance-report.usecase';
import { GetMonthlyStaffAttendanceSummaryUseCase } from '@application/staff-attendance/use-cases/get-monthly-staff-attendance-summary.usecase';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StaffAttendanceRepository } from '@domain/staff-attendance/ports/staff-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: StaffAttendanceModel.name, schema: StaffAttendanceSchema },
      { name: HolidayModel.name, schema: HolidaySchema },
    ]),
  ],
  controllers: [StaffAttendanceController],
  providers: [
    { provide: STAFF_ATTENDANCE_REPOSITORY, useClass: MongoStaffAttendanceRepository },
    { provide: HOLIDAY_REPOSITORY, useClass: MongoHolidayRepository },
    {
      provide: 'GET_DAILY_STAFF_ATTENDANCE_VIEW_USE_CASE',
      useFactory: (ur: UserRepository, sar: StaffAttendanceRepository, hr: HolidayRepository) =>
        new GetDailyStaffAttendanceViewUseCase(ur, sar, hr),
      inject: [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY, HOLIDAY_REPOSITORY],
    },
    {
      provide: 'MARK_STAFF_ATTENDANCE_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sar: StaffAttendanceRepository,
        audit: AuditRecorderPort,
      ) => new MarkStaffAttendanceUseCase(ur, sar, audit),
      inject: [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'GET_DAILY_STAFF_ATTENDANCE_REPORT_USE_CASE',
      useFactory: (ur: UserRepository, sar: StaffAttendanceRepository) =>
        new GetDailyStaffAttendanceReportUseCase(ur, sar),
      inject: [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY],
    },
    {
      provide: 'GET_MONTHLY_STAFF_ATTENDANCE_SUMMARY_USE_CASE',
      useFactory: (ur: UserRepository, sar: StaffAttendanceRepository, hr: HolidayRepository) =>
        new GetMonthlyStaffAttendanceSummaryUseCase(ur, sar, hr),
      inject: [USER_REPOSITORY, STAFF_ATTENDANCE_REPOSITORY, HOLIDAY_REPOSITORY],
    },
  ],
})
export class StaffAttendanceModule {}
