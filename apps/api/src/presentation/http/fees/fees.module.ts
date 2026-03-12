import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeesController } from './fees.controller';
import { AuthModule } from '../auth/auth.module';
import { AcademyOnboardingModule } from '../academy-onboarding/academy-onboarding.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { FeeDueModel, FeeDueSchema } from '@infrastructure/database/schemas/fee-due.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import {
  TransactionLogModel,
  TransactionLogSchema,
} from '@infrastructure/database/schemas/transaction-log.schema';
import { MongoFeeDueRepository } from '@infrastructure/repositories/mongo-fee-due.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoTransactionLogRepository } from '@infrastructure/repositories/mongo-transaction-log.repository';
import { MongoTransactionService } from '@infrastructure/database/mongo-transaction.service';
import { FEE_DUE_REPOSITORY } from '@domain/fee/ports/fee-due.repository';
import { TRANSACTION_LOG_REPOSITORY } from '@domain/fee/ports/transaction-log.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import { CLOCK_PORT } from '@application/common/clock.port';
import { TRANSACTION_PORT } from '@application/common/transaction.port';
import { SystemClock } from '@application/common/system-clock';
import { ListUnpaidDuesUseCase } from '@application/fee/use-cases/list-unpaid-dues.usecase';
import { ListPaidDuesUseCase } from '@application/fee/use-cases/list-paid-dues.usecase';
import { GetStudentFeesUseCase } from '@application/fee/use-cases/get-student-fees.usecase';
import { MarkFeePaidUseCase } from '@application/fee/use-cases/mark-fee-paid.usecase';
import { RunMonthlyDuesEngineUseCase } from '@application/fee/use-cases/run-monthly-dues-engine.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { ClockPort } from '@application/common/clock.port';
import type { TransactionPort } from '@application/common/transaction.port';

@Module({
  imports: [
    AuthModule,
    AcademyOnboardingModule,
    SubscriptionModule,
    MongooseModule.forFeature([
      { name: FeeDueModel.name, schema: FeeDueSchema },
      { name: StudentModel.name, schema: StudentSchema },
      { name: TransactionLogModel.name, schema: TransactionLogSchema },
    ]),
  ],
  controllers: [FeesController],
  providers: [
    { provide: FEE_DUE_REPOSITORY, useClass: MongoFeeDueRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: TRANSACTION_LOG_REPOSITORY, useClass: MongoTransactionLogRepository },
    { provide: TRANSACTION_PORT, useClass: MongoTransactionService },
    { provide: CLOCK_PORT, useClass: SystemClock },
    {
      provide: 'LIST_UNPAID_DUES_USE_CASE',
      useFactory: (userRepo: UserRepository, feeDueRepo: FeeDueRepository, academyRepo: AcademyRepository, clock: ClockPort) =>
        new ListUnpaidDuesUseCase(userRepo, feeDueRepo, academyRepo, clock),
      inject: [USER_REPOSITORY, FEE_DUE_REPOSITORY, ACADEMY_REPOSITORY, CLOCK_PORT],
    },
    {
      provide: 'LIST_PAID_DUES_USE_CASE',
      useFactory: (userRepo: UserRepository, feeDueRepo: FeeDueRepository) =>
        new ListPaidDuesUseCase(userRepo, feeDueRepo),
      inject: [USER_REPOSITORY, FEE_DUE_REPOSITORY],
    },
    {
      provide: 'GET_STUDENT_FEES_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        feeDueRepo: FeeDueRepository,
        academyRepo: AcademyRepository,
        clock: ClockPort,
      ) => new GetStudentFeesUseCase(userRepo, studentRepo, feeDueRepo, academyRepo, clock),
      inject: [USER_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY, ACADEMY_REPOSITORY, CLOCK_PORT],
    },
    {
      provide: 'MARK_FEE_PAID_USE_CASE',
      useFactory: (
        userRepo: UserRepository,
        studentRepo: StudentRepository,
        feeDueRepo: FeeDueRepository,
        tlRepo: TransactionLogRepository,
        academyRepo: AcademyRepository,
        clock: ClockPort,
        tx: TransactionPort,
      ) =>
        new MarkFeePaidUseCase(userRepo, studentRepo, feeDueRepo, tlRepo, academyRepo, clock, tx),
      inject: [
        USER_REPOSITORY,
        STUDENT_REPOSITORY,
        FEE_DUE_REPOSITORY,
        TRANSACTION_LOG_REPOSITORY,
        ACADEMY_REPOSITORY,
        CLOCK_PORT,
        TRANSACTION_PORT,
      ],
    },
    {
      provide: 'RUN_MONTHLY_DUES_ENGINE_USE_CASE',
      useFactory: (
        academyRepo: AcademyRepository,
        studentRepo: StudentRepository,
        feeDueRepo: FeeDueRepository,
      ) => new RunMonthlyDuesEngineUseCase(academyRepo, studentRepo, feeDueRepo),
      inject: [ACADEMY_REPOSITORY, STUDENT_REPOSITORY, FEE_DUE_REPOSITORY],
    },
  ],
  exports: ['RUN_MONTHLY_DUES_ENGINE_USE_CASE'],
})
export class FeesModule {}
