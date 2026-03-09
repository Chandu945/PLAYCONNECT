import type { AuditRecorderPort } from '../ports/audit-recorder.port';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import type { AuditActionType, AuditEntityType } from '@playconnect/contracts';
import { AuditLog } from '@domain/audit/entities/audit-log.entity';
import { sanitizeContext } from '@domain/audit/rules/audit.rules';

export class AuditRecorderService implements AuditRecorderPort {
  constructor(private readonly auditLogRepo: AuditLogRepository) {}

  async record(params: {
    academyId: string;
    actorUserId: string;
    action: AuditActionType;
    entityType: AuditEntityType;
    entityId: string;
    context?: Record<string, string>;
  }): Promise<void> {
    const sanitized = sanitizeContext(params.context);
    const log = AuditLog.create({
      academyId: params.academyId,
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      context: sanitized,
    });
    try {
      await this.auditLogRepo.save(log);
    } catch (error) {
      console.error('Failed to save audit log', error);
    }
  }
}
