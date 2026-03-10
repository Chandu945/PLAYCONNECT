import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttendanceController } from './attendance.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DeviceTokensModule } from '../device-tokens/device-tokens.module';
import {
  StudentAttendanceModel,
  StudentAttendanceSchema,
} from '@infrastructure/database/schemas/student-attendance.schema';
import { HolidayModel, HolidaySchema } from '@infrastructure/database/schemas/holiday.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import {
  StudentBatchModel,
  StudentBatchSchema,
} from '@infrastructure/database/schemas/student-batch.schema';
import { MongoStudentAttendanceRepository } from '@infrastructure/repositories/mongo-student-attendance.repository';
import { MongoHolidayRepository } from '@infrastructure/repositories/mongo-holiday.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoStudentBatchRepository } from '@infrastructure/repositories/mongo-student-batch.repository';
import { MongoParentStudentLinkRepository } from '@infrastructure/repositories/mongo-parent-student-link.repository';
import {
  ParentStudentLinkModel,
  ParentStudentLinkSchema,
} from '@infrastructure/database/schemas/parent-student-link.schema';
import { PARENT_STUDENT_LINK_REPOSITORY } from '@domain/parent/ports/parent-student-link.repository';
import { STUDENT_ATTENDANCE_REPOSITORY } from '@domain/attendance/ports/student-attendance.repository';
import { HOLIDAY_REPOSITORY } from '@domain/attendance/ports/holiday.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { STUDENT_BATCH_REPOSITORY } from '@domain/batch/ports/student-batch.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { GetDailyAttendanceViewUseCase } from '@application/attendance/use-cases/get-daily-attendance-view.usecase';
import { MarkStudentAttendanceUseCase } from '@application/attendance/use-cases/mark-student-attendance.usecase';
import { BulkSetAbsencesUseCase } from '@application/attendance/use-cases/bulk-set-absences.usecase';
import { DeclareHolidayUseCase } from '@application/attendance/use-cases/declare-holiday.usecase';
import { RemoveHolidayUseCase } from '@application/attendance/use-cases/remove-holiday.usecase';
import { ListHolidaysUseCase } from '@application/attendance/use-cases/list-holidays.usecase';
import { GetDailyAttendanceReportUseCase } from '@application/attendance/use-cases/get-daily-attendance-report.usecase';
import { GetStudentMonthlyAttendanceUseCase } from '@application/attendance/use-cases/get-student-monthly-attendance.usecase';
import { GetMonthlyAttendanceSummaryUseCase } from '@application/attendance/use-cases/get-monthly-attendance-summary.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    DeviceTokensModule,
    MongooseModule.forFeature([
      { name: StudentAttendanceModel.name, schema: StudentAttendanceSchema },
      { name: HolidayModel.name, schema: HolidaySchema },
      { name: StudentModel.name, schema: StudentSchema },
      { name: StudentBatchModel.name, schema: StudentBatchSchema },
      { name: ParentStudentLinkModel.name, schema: ParentStudentLinkSchema },
    ]),
  ],
  controllers: [AttendanceController],
  providers: [
    { provide: STUDENT_ATTENDANCE_REPOSITORY, useClass: MongoStudentAttendanceRepository },
    { provide: HOLIDAY_REPOSITORY, useClass: MongoHolidayRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: STUDENT_BATCH_REPOSITORY, useClass: MongoStudentBatchRepository },
    { provide: PARENT_STUDENT_LINK_REPOSITORY, useClass: MongoParentStudentLinkRepository },
    {
      provide: 'GET_DAILY_ATTENDANCE_VIEW_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        sbr: StudentBatchRepository,
      ) => new GetDailyAttendanceViewUseCase(ur, sr, ar, hr, sbr),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        STUDENT_BATCH_REPOSITORY,
      ],
    },
    {
      provide: 'MARK_STUDENT_ATTENDANCE_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        audit: AuditRecorderPort,
      ) => new MarkStudentAttendanceUseCase(ur, sr, ar, hr, audit),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        AUDIT_RECORDER_PORT,
      ],
    },
    {
      provide: 'BULK_SET_ABSENCES_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        audit: AuditRecorderPort,
      ) => new BulkSetAbsencesUseCase(ur, sr, ar, hr, audit),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        AUDIT_RECORDER_PORT,
      ],
    },
    {
      provide: 'DECLARE_HOLIDAY_USE_CASE',
      useFactory: (ur: UserRepository, hr: HolidayRepository, ar: StudentAttendanceRepository) =>
        new DeclareHolidayUseCase(ur, hr, ar),
      inject: [USER_REPOSITORY, HOLIDAY_REPOSITORY, STUDENT_ATTENDANCE_REPOSITORY],
    },
    {
      provide: 'REMOVE_HOLIDAY_USE_CASE',
      useFactory: (ur: UserRepository, hr: HolidayRepository) => new RemoveHolidayUseCase(ur, hr),
      inject: [USER_REPOSITORY, HOLIDAY_REPOSITORY],
    },
    {
      provide: 'LIST_HOLIDAYS_USE_CASE',
      useFactory: (ur: UserRepository, hr: HolidayRepository) => new ListHolidaysUseCase(ur, hr),
      inject: [USER_REPOSITORY, HOLIDAY_REPOSITORY],
    },
    {
      provide: 'GET_DAILY_ATTENDANCE_REPORT_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
      ) => new GetDailyAttendanceReportUseCase(ur, sr, ar, hr),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
      ],
    },
    {
      provide: 'GET_STUDENT_MONTHLY_ATTENDANCE_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
      ) => new GetStudentMonthlyAttendanceUseCase(ur, sr, ar, hr),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
      ],
    },
    {
      provide: 'GET_MONTHLY_ATTENDANCE_SUMMARY_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
      ) => new GetMonthlyAttendanceSummaryUseCase(ur, sr, ar, hr),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
      ],
    },
  ],
})
export class AttendanceModule {}
