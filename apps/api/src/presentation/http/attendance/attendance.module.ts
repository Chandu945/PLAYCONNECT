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
import { MongoBatchRepository } from '@infrastructure/repositories/mongo-batch.repository';
import { BatchModel, BatchSchema } from '@infrastructure/database/schemas/batch.schema';
import { MongoParentStudentLinkRepository } from '@infrastructure/repositories/mongo-parent-student-link.repository';
import { MongoTransactionService } from '@infrastructure/database/mongo-transaction.service';
import {
  ParentStudentLinkModel,
  ParentStudentLinkSchema,
} from '@infrastructure/database/schemas/parent-student-link.schema';
import { PARENT_STUDENT_LINK_REPOSITORY } from '@domain/parent/ports/parent-student-link.repository';
import { STUDENT_ATTENDANCE_REPOSITORY } from '@domain/attendance/ports/student-attendance.repository';
import { HOLIDAY_REPOSITORY } from '@domain/attendance/ports/holiday.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { STUDENT_BATCH_REPOSITORY } from '@domain/batch/ports/student-batch.repository';
import { BATCH_REPOSITORY } from '@domain/batch/ports/batch.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
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
import { GetMonthDailyCountsUseCase } from '@application/attendance/use-cases/get-month-daily-counts.usecase';
import { ExportStudentMonthlyAttendancePdfUseCase } from '@application/attendance/use-cases/export-student-monthly-attendance-pdf.usecase';
import { ExportMonthlyAttendanceSummaryPdfUseCase } from '@application/attendance/use-cases/export-monthly-attendance-summary-pdf.usecase';
import { ExportMonthlyAttendanceSummaryCsvUseCase } from '@application/attendance/use-cases/export-monthly-attendance-summary-csv.usecase';
import { PdfkitRenderer } from '@infrastructure/reports/pdfkit-renderer';
import { PDF_RENDERER } from '@application/reports/ports/pdf-renderer.port';
import type { PdfRenderer } from '@application/reports/ports/pdf-renderer.port';
import { MongoAcademyRepository } from '@infrastructure/repositories/mongo-academy.repository';
import { AcademyModel, AcademySchema } from '@infrastructure/database/schemas/academy.schema';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import { AUDIT_LOG_REPOSITORY } from '@domain/audit/ports/audit-log.repository';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import { ABSENCE_NOTIFICATION_SCHEDULER_PORT } from '@application/notifications/ports/absence-notification-scheduler.port';
import type { AbsenceNotificationSchedulerPort } from '@application/notifications/ports/absence-notification-scheduler.port';
import { TRANSACTION_PORT } from '@application/common/transaction.port';
import type { TransactionPort } from '@application/common/transaction.port';
import { PUSH_NOTIFICATION_SERVICE } from '../device-tokens/device-tokens.module';
import type { PushNotificationService } from '@application/notifications/push-notification.service';

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
      { name: BatchModel.name, schema: BatchSchema },
      { name: ParentStudentLinkModel.name, schema: ParentStudentLinkSchema },
      { name: AcademyModel.name, schema: AcademySchema },
    ]),
  ],
  controllers: [AttendanceController],
  providers: [
    { provide: STUDENT_ATTENDANCE_REPOSITORY, useClass: MongoStudentAttendanceRepository },
    { provide: HOLIDAY_REPOSITORY, useClass: MongoHolidayRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: STUDENT_BATCH_REPOSITORY, useClass: MongoStudentBatchRepository },
    { provide: BATCH_REPOSITORY, useClass: MongoBatchRepository },
    { provide: ACADEMY_REPOSITORY, useClass: MongoAcademyRepository },
    { provide: PDF_RENDERER, useClass: PdfkitRenderer },
    { provide: PARENT_STUDENT_LINK_REPOSITORY, useClass: MongoParentStudentLinkRepository },
    { provide: TRANSACTION_PORT, useClass: MongoTransactionService },
    {
      provide: 'GET_DAILY_ATTENDANCE_VIEW_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        sbr: StudentBatchRepository,
        br: BatchRepository,
        alr: AuditLogRepository,
      ) => new GetDailyAttendanceViewUseCase(ur, sr, ar, hr, sbr, br, alr),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        STUDENT_BATCH_REPOSITORY,
        BATCH_REPOSITORY,
        AUDIT_LOG_REPOSITORY,
      ],
    },
    {
      provide: 'MARK_STUDENT_ATTENDANCE_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        br: BatchRepository,
        sbr: StudentBatchRepository,
        audit: AuditRecorderPort,
        scheduler: AbsenceNotificationSchedulerPort,
      ) => new MarkStudentAttendanceUseCase(ur, sr, ar, hr, br, sbr, audit, scheduler),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        BATCH_REPOSITORY,
        STUDENT_BATCH_REPOSITORY,
        AUDIT_RECORDER_PORT,
        ABSENCE_NOTIFICATION_SCHEDULER_PORT,
      ],
    },
    {
      provide: 'BULK_SET_ABSENCES_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        br: BatchRepository,
        sbr: StudentBatchRepository,
        audit: AuditRecorderPort,
        tx: TransactionPort,
        scheduler: AbsenceNotificationSchedulerPort,
      ) => new BulkSetAbsencesUseCase(ur, sr, ar, hr, br, sbr, audit, tx, scheduler),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        BATCH_REPOSITORY,
        STUDENT_BATCH_REPOSITORY,
        AUDIT_RECORDER_PORT,
        TRANSACTION_PORT,
        ABSENCE_NOTIFICATION_SCHEDULER_PORT,
      ],
    },
    {
      provide: 'DECLARE_HOLIDAY_USE_CASE',
      useFactory: (
        ur: UserRepository,
        hr: HolidayRepository,
        academyRepo: AcademyRepository,
        audit: AuditRecorderPort,
        push: PushNotificationService,
      ) => new DeclareHolidayUseCase(ur, hr, academyRepo, audit, push),
      inject: [
        USER_REPOSITORY,
        HOLIDAY_REPOSITORY,
        ACADEMY_REPOSITORY,
        AUDIT_RECORDER_PORT,
        PUSH_NOTIFICATION_SERVICE,
      ],
    },
    {
      provide: 'REMOVE_HOLIDAY_USE_CASE',
      useFactory: (
        ur: UserRepository,
        hr: HolidayRepository,
        audit: AuditRecorderPort,
        academyRepo: AcademyRepository,
        push: PushNotificationService,
      ) => new RemoveHolidayUseCase(ur, hr, audit, academyRepo, push),
      inject: [
        USER_REPOSITORY,
        HOLIDAY_REPOSITORY,
        AUDIT_RECORDER_PORT,
        ACADEMY_REPOSITORY,
        PUSH_NOTIFICATION_SERVICE,
      ],
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
        sbr: StudentBatchRepository,
        br: BatchRepository,
      ) => new GetDailyAttendanceReportUseCase(ur, sr, ar, hr, sbr, br),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        STUDENT_BATCH_REPOSITORY,
        BATCH_REPOSITORY,
      ],
    },
    {
      provide: 'GET_STUDENT_MONTHLY_ATTENDANCE_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        sbr: StudentBatchRepository,
        br: BatchRepository,
      ) => new GetStudentMonthlyAttendanceUseCase(ur, sr, ar, hr, sbr, br),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        STUDENT_BATCH_REPOSITORY,
        BATCH_REPOSITORY,
      ],
    },
    {
      provide: 'GET_MONTHLY_ATTENDANCE_SUMMARY_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
        sbr: StudentBatchRepository,
        br: BatchRepository,
      ) => new GetMonthlyAttendanceSummaryUseCase(ur, sr, ar, hr, sbr, br),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
        STUDENT_BATCH_REPOSITORY,
        BATCH_REPOSITORY,
      ],
    },
    {
      provide: 'GET_MONTH_DAILY_COUNTS_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        ar: StudentAttendanceRepository,
        hr: HolidayRepository,
      ) => new GetMonthDailyCountsUseCase(ur, sr, ar, hr),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        STUDENT_ATTENDANCE_REPOSITORY,
        HOLIDAY_REPOSITORY,
      ],
    },
    {
      provide: 'EXPORT_STUDENT_MONTHLY_ATTENDANCE_PDF_USE_CASE',
      useFactory: (
        getDetail: GetStudentMonthlyAttendanceUseCase,
        sr: StudentRepository,
        renderer: PdfRenderer,
      ) => new ExportStudentMonthlyAttendancePdfUseCase(getDetail, sr, renderer),
      inject: ['GET_STUDENT_MONTHLY_ATTENDANCE_USE_CASE', STUDENT_REPOSITORY, PDF_RENDERER],
    },
    {
      provide: 'EXPORT_MONTHLY_ATTENDANCE_SUMMARY_PDF_USE_CASE',
      useFactory: (
        getSummary: GetMonthlyAttendanceSummaryUseCase,
        ur: UserRepository,
        ar: AcademyRepository,
        renderer: PdfRenderer,
      ) => new ExportMonthlyAttendanceSummaryPdfUseCase(getSummary, ur, ar, renderer),
      inject: [
        'GET_MONTHLY_ATTENDANCE_SUMMARY_USE_CASE',
        USER_REPOSITORY,
        ACADEMY_REPOSITORY,
        PDF_RENDERER,
      ],
    },
    {
      provide: 'EXPORT_MONTHLY_ATTENDANCE_SUMMARY_CSV_USE_CASE',
      useFactory: (getSummary: GetMonthlyAttendanceSummaryUseCase) =>
        new ExportMonthlyAttendanceSummaryCsvUseCase(getSummary),
      inject: ['GET_MONTHLY_ATTENDANCE_SUMMARY_USE_CASE'],
    },
  ],
})
export class AttendanceModule {}
