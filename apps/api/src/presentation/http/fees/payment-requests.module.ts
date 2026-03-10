import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentRequestsController } from './payment-requests.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AcademyOnboardingModule } from '../academy-onboarding/academy-onboarding.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { DeviceTokensModule } from '../device-tokens/device-tokens.module';
import { FeeDueModel, FeeDueSchema } from '@infrastructure/database/schemas/fee-due.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import {
  PaymentRequestModel,
  PaymentRequestSchema,
} from '@infrastructure/database/schemas/payment-request.schema';
import {
  TransactionLogModel,
  TransactionLogSchema,
} from '@infrastructure/database/schemas/transaction-log.schema';
import { MongoFeeDueRepository } from '@infrastructure/repositories/mongo-fee-due.repository';
import { MongoPaymentRequestRepository } from '@infrastructure/repositories/mongo-payment-request.repository';
import { MongoTransactionLogRepository } from '@infrastructure/repositories/mongo-transaction-log.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoTransactionService } from '@infrastructure/database/mongo-transaction.service';
import { FEE_DUE_REPOSITORY } from '@domain/fee/ports/fee-due.repository';
import { PAYMENT_REQUEST_REPOSITORY } from '@domain/fee/ports/payment-request.repository';
import { TRANSACTION_LOG_REPOSITORY } from '@domain/fee/ports/transaction-log.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import { CLOCK_PORT } from '@application/common/clock.port';
import { TRANSACTION_PORT } from '@application/common/transaction.port';
import { CreatePaymentRequestUseCase } from '@application/fee/use-cases/create-payment-request.usecase';
import { ListPaymentRequestsUseCase } from '@application/fee/use-cases/list-payment-requests.usecase';
import { CancelPaymentRequestUseCase } from '@application/fee/use-cases/cancel-payment-request.usecase';
import { EditPaymentRequestUseCase } from '@application/fee/use-cases/edit-payment-request.usecase';
import { ApprovePaymentRequestUseCase } from '@application/fee/use-cases/approve-payment-request.usecase';
import { RejectPaymentRequestUseCase } from '@application/fee/use-cases/reject-payment-request.usecase';
import { ListTransactionLogsUseCase } from '@application/fee/use-cases/list-transaction-logs.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '@domain/fee/ports/payment-request.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { ClockPort } from '@application/common/clock.port';
import type { TransactionPort } from '@application/common/transaction.port';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import { AUDIT_LOG_REPOSITORY } from '@domain/audit/ports/audit-log.repository';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
    AcademyOnboardingModule,
    SubscriptionModule,
    DeviceTokensModule,
    MongooseModule.forFeature([
      { name: FeeDueModel.name, schema: FeeDueSchema },
      { name: StudentModel.name, schema: StudentSchema },
      { name: PaymentRequestModel.name, schema: PaymentRequestSchema },
      { name: TransactionLogModel.name, schema: TransactionLogSchema },
    ]),
  ],
  controllers: [PaymentRequestsController],
  providers: [
    { provide: FEE_DUE_REPOSITORY, useClass: MongoFeeDueRepository },
    { provide: PAYMENT_REQUEST_REPOSITORY, useClass: MongoPaymentRequestRepository },
    { provide: TRANSACTION_LOG_REPOSITORY, useClass: MongoTransactionLogRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: TRANSACTION_PORT, useClass: MongoTransactionService },
    {
      provide: 'CREATE_PAYMENT_REQUEST_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        fdr: FeeDueRepository,
        prr: PaymentRequestRepository,
        audit: AuditRecorderPort,
      ) => new CreatePaymentRequestUseCase(ur, sr, fdr, prr, audit),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        FEE_DUE_REPOSITORY,
        PAYMENT_REQUEST_REPOSITORY,
        AUDIT_RECORDER_PORT,
      ],
    },
    {
      provide: 'LIST_PAYMENT_REQUESTS_USE_CASE',
      useFactory: (ur: UserRepository, sr: StudentRepository, prr: PaymentRequestRepository) =>
        new ListPaymentRequestsUseCase(ur, sr, prr),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY],
    },
    {
      provide: 'EDIT_PAYMENT_REQUEST_USE_CASE',
      useFactory: (ur: UserRepository, sr: StudentRepository, prr: PaymentRequestRepository, audit: AuditRecorderPort) =>
        new EditPaymentRequestUseCase(ur, sr, prr, audit),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'CANCEL_PAYMENT_REQUEST_USE_CASE',
      useFactory: (ur: UserRepository, sr: StudentRepository, prr: PaymentRequestRepository, audit: AuditRecorderPort) =>
        new CancelPaymentRequestUseCase(ur, sr, prr, audit),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'APPROVE_PAYMENT_REQUEST_USE_CASE',
      useFactory: (
        ur: UserRepository,
        ar: AcademyRepository,
        fdr: FeeDueRepository,
        prr: PaymentRequestRepository,
        tlr: TransactionLogRepository,
        sr: StudentRepository,
        clock: ClockPort,
        tx: TransactionPort,
        auditLogRepo: AuditLogRepository,
      ) => new ApprovePaymentRequestUseCase(ur, ar, fdr, prr, tlr, sr, clock, tx, auditLogRepo),
      inject: [
        USER_REPOSITORY,
        ACADEMY_REPOSITORY,
        FEE_DUE_REPOSITORY,
        PAYMENT_REQUEST_REPOSITORY,
        TRANSACTION_LOG_REPOSITORY,
        STUDENT_REPOSITORY,
        CLOCK_PORT,
        TRANSACTION_PORT,
        AUDIT_LOG_REPOSITORY,
      ],
    },
    {
      provide: 'REJECT_PAYMENT_REQUEST_USE_CASE',
      useFactory: (
        ur: UserRepository,
        sr: StudentRepository,
        prr: PaymentRequestRepository,
        fdr: FeeDueRepository,
        clock: ClockPort,
        audit: AuditRecorderPort,
      ) => new RejectPaymentRequestUseCase(ur, sr, prr, fdr, clock, audit),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, PAYMENT_REQUEST_REPOSITORY, FEE_DUE_REPOSITORY, CLOCK_PORT, AUDIT_RECORDER_PORT],
    },
    {
      provide: 'LIST_TRANSACTION_LOGS_USE_CASE',
      useFactory: (ur: UserRepository, tlr: TransactionLogRepository) =>
        new ListTransactionLogsUseCase(ur, tlr),
      inject: [USER_REPOSITORY, TRANSACTION_LOG_REPOSITORY],
    },
  ],
})
export class PaymentRequestsModule {}
