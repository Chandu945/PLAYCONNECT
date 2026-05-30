import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './reports.controller';
import { AuthModule } from '../auth/auth.module';
import { AcademyOnboardingModule } from '../academy-onboarding/academy-onboarding.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import { FeeDueModel, FeeDueSchema } from '@infrastructure/database/schemas/fee-due.schema';
import {
  TransactionLogModel,
  TransactionLogSchema,
} from '@infrastructure/database/schemas/transaction-log.schema';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoFeeDueRepository } from '@infrastructure/repositories/mongo-fee-due.repository';
import { MongoTransactionLogRepository } from '@infrastructure/repositories/mongo-transaction-log.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { FEE_DUE_REPOSITORY } from '@domain/fee/ports/fee-due.repository';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import { TRANSACTION_LOG_REPOSITORY } from '@domain/fee/ports/transaction-log.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { CLOCK_PORT } from '@application/common/clock.port';
import { SystemClock } from '@application/common/system-clock';
import { GetStudentWiseDuesReportUseCase } from '@application/reports/use-cases/get-student-wise-dues-report.usecase';
import { GetMonthWiseDuesReportUseCase } from '@application/reports/use-cases/get-month-wise-dues-report.usecase';
import { GetMonthlyRevenueReportUseCase } from '@application/reports/use-cases/get-monthly-revenue-report.usecase';
import { ExportMonthlyRevenuePdfUseCase } from '@application/reports/use-cases/export-monthly-revenue-pdf.usecase';
import { ExportPendingDuesPdfUseCase } from '@application/reports/use-cases/export-pending-dues-pdf.usecase';
import { PDF_RENDERER } from '@application/reports/ports/pdf-renderer.port';
import { PdfkitRenderer } from '@infrastructure/reports/pdfkit-renderer';
import type { PdfRenderer } from '@application/reports/ports/pdf-renderer.port';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { ClockPort } from '@application/common/clock.port';

@Module({
  imports: [
    AuthModule,
    AcademyOnboardingModule,
    SubscriptionModule,
    MongooseModule.forFeature([
      { name: StudentModel.name, schema: StudentSchema },
      { name: FeeDueModel.name, schema: FeeDueSchema },
      { name: TransactionLogModel.name, schema: TransactionLogSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: FEE_DUE_REPOSITORY, useClass: MongoFeeDueRepository },
    { provide: TRANSACTION_LOG_REPOSITORY, useClass: MongoTransactionLogRepository },
    { provide: CLOCK_PORT, useClass: SystemClock },
    { provide: PDF_RENDERER, useClass: PdfkitRenderer },
    {
      provide: 'GET_STUDENT_WISE_DUES_REPORT_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        fdRepo: FeeDueRepository,
        academyRepo: AcademyRepository,
        clock: ClockPort,
      ) => new GetStudentWiseDuesReportUseCase(userRepo, studentRepo, fdRepo, academyRepo, clock),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY, ACADEMY_REPOSITORY, CLOCK_PORT],
    },
    {
      provide: 'GET_MONTH_WISE_DUES_REPORT_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        fdRepo: FeeDueRepository,
        academyRepo: AcademyRepository,
        clock: ClockPort,
      ) => new GetMonthWiseDuesReportUseCase(userRepo, studentRepo, fdRepo, academyRepo, clock),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY, ACADEMY_REPOSITORY, CLOCK_PORT],
    },
    {
      provide: 'GET_MONTHLY_REVENUE_REPORT_USE_CASE',
      useFactory: (userRepo: UserRepository, tlRepo: TransactionLogRepository) =>
        new GetMonthlyRevenueReportUseCase(userRepo, tlRepo),
      inject: [USER_REPOSITORY, TRANSACTION_LOG_REPOSITORY],
    },
    {
      provide: 'EXPORT_MONTHLY_REVENUE_PDF_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        tlRepo: TransactionLogRepository,
        pdfRenderer: PdfRenderer,
      ) => new ExportMonthlyRevenuePdfUseCase(userRepo, tlRepo, pdfRenderer),
      inject: [USER_REPOSITORY, TRANSACTION_LOG_REPOSITORY, PDF_RENDERER],
    },
    {
      provide: 'EXPORT_PENDING_DUES_PDF_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        fdRepo: FeeDueRepository,
        pdfRenderer: PdfRenderer,
        academyRepo: AcademyRepository,
        clock: ClockPort,
      ) => new ExportPendingDuesPdfUseCase(userRepo, studentRepo, fdRepo, pdfRenderer, academyRepo, clock),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY, PDF_RENDERER, ACADEMY_REPOSITORY, CLOCK_PORT],
    },
  ],
})
export class ReportsModule {}
