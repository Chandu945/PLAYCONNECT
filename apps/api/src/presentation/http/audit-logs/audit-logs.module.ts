import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogsController } from './audit-logs.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModel, AuditLogSchema } from '@infrastructure/database/schemas/audit-log.schema';
import { MongoAuditLogRepository } from '@infrastructure/repositories/mongo-audit-log.repository';
import { AUDIT_LOG_REPOSITORY } from '@domain/audit/ports/audit-log.repository';
import { AUDIT_RECORDER_PORT } from '@application/audit/ports/audit-recorder.port';
import { AuditRecorderService } from '@application/audit/services/audit-recorder.service';
import { ListAuditLogsUseCase } from '@application/audit/use-cases/list-audit-logs.usecase';
import { USER_REPOSITORY } from '@domain/identity/ports/user.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import type { LoggerPort } from '@shared/logging/logger.port';
import { LOGGER_PORT } from '@shared/logging/logger.port';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: AuditLogModel.name, schema: AuditLogSchema }]),
  ],
  controllers: [AuditLogsController],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: MongoAuditLogRepository },
    {
      provide: AUDIT_RECORDER_PORT,
      useFactory: (repo: AuditLogRepository, logger: LoggerPort) =>
        new AuditRecorderService(repo, logger),
      inject: [AUDIT_LOG_REPOSITORY, LOGGER_PORT],
    },
    {
      provide: 'LIST_AUDIT_LOGS_USE_CASE',
      useFactory: (userRepo: UserRepository, auditLogRepo: AuditLogRepository) =>
        new ListAuditLogsUseCase(userRepo, auditLogRepo),
      inject: [USER_REPOSITORY, AUDIT_LOG_REPOSITORY],
    },
  ],
  exports: [AUDIT_RECORDER_PORT, AUDIT_LOG_REPOSITORY],
})
export class AuditLogsModule {}
