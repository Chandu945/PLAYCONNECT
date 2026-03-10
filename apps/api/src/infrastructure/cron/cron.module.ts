import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { MonthlyDuesCronService } from './monthly-dues.cron';
import { AcademyModel, AcademySchema } from '@infrastructure/database/schemas/academy.schema';
import { FeeDueModel, FeeDueSchema } from '@infrastructure/database/schemas/fee-due.schema';
import { StudentModel, StudentSchema } from '@infrastructure/database/schemas/student.schema';
import { MongoAcademyRepository } from '@infrastructure/repositories/mongo-academy.repository';
import { MongoStudentRepository } from '@infrastructure/repositories/mongo-student.repository';
import { MongoFeeDueRepository } from '@infrastructure/repositories/mongo-fee-due.repository';
import { MongoAuditLogRepository } from '@infrastructure/repositories/mongo-audit-log.repository';
import { AuditLogModel, AuditLogSchema } from '@infrastructure/database/schemas/audit-log.schema';
import { ACADEMY_REPOSITORY } from '@domain/academy/ports/academy.repository';
import { STUDENT_REPOSITORY } from '@domain/student/ports/student.repository';
import { FEE_DUE_REPOSITORY } from '@domain/fee/ports/fee-due.repository';
import { AUDIT_LOG_REPOSITORY } from '@domain/audit/ports/audit-log.repository';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import { AuditRecorderService } from '@application/audit/services/audit-recorder.service';
import type { LoggerPort } from '@shared/logging/logger.port';
import { LOGGER_PORT } from '@shared/logging/logger.port';
import { RunMonthlyDuesEngineUseCase } from '@application/fee/use-cases/run-monthly-dues-engine.usecase';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: AcademyModel.name, schema: AcademySchema },
      { name: FeeDueModel.name, schema: FeeDueSchema },
      { name: StudentModel.name, schema: StudentSchema },
      { name: AuditLogModel.name, schema: AuditLogSchema },
    ]),
  ],
  providers: [
    { provide: ACADEMY_REPOSITORY, useClass: MongoAcademyRepository },
    { provide: STUDENT_REPOSITORY, useClass: MongoStudentRepository },
    { provide: FEE_DUE_REPOSITORY, useClass: MongoFeeDueRepository },
    { provide: AUDIT_LOG_REPOSITORY, useClass: MongoAuditLogRepository },
    {
      provide: AUDIT_RECORDER_PORT,
      useFactory: (repo: AuditLogRepository, logger: LoggerPort) =>
        new AuditRecorderService(repo, logger),
      inject: [AUDIT_LOG_REPOSITORY, LOGGER_PORT],
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
    MonthlyDuesCronService,
  ],
})
export class CronModule {}
