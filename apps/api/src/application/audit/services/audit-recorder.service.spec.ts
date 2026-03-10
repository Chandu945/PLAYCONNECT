import { AuditRecorderService } from './audit-recorder.service';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import type { LoggerPort } from '@shared/logging/logger.port';

describe('AuditRecorderService', () => {
  let service: AuditRecorderService;
  let repo: jest.Mocked<AuditLogRepository>;
  let logger: jest.Mocked<LoggerPort>;

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      listByAcademy: jest.fn(),
    } as jest.Mocked<AuditLogRepository>;
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerPort>;
    service = new AuditRecorderService(repo, logger);
  });

  it('should call repo.save with a created AuditLog', async () => {
    await service.record({
      academyId: 'academy-1',
      actorUserId: 'user-1',
      action: 'STUDENT_CREATED',
      entityType: 'STUDENT',
      entityId: 'student-1',
      context: { fullName: 'Arun Sharma' },
    });

    expect(repo.save).toHaveBeenCalledTimes(1);
    const savedLog = repo.save.mock.calls[0]![0]!;
    expect(savedLog.academyId).toBe('academy-1');
    expect(savedLog.actorUserId).toBe('user-1');
    expect(savedLog.action).toBe('STUDENT_CREATED');
    expect(savedLog.entityType).toBe('STUDENT');
    expect(savedLog.entityId).toBe('student-1');
    expect(savedLog.context).toEqual({ fullName: 'Arun Sharma' });
  });

  it('should sanitize context before saving', async () => {
    await service.record({
      academyId: 'academy-1',
      actorUserId: 'user-1',
      action: 'STUDENT_CREATED',
      entityType: 'STUDENT',
      entityId: 'student-1',
      context: { email: 'test@example.com' },
    });

    const savedLog = repo.save.mock.calls[0]![0]!;
    expect(savedLog.context!['email']).toContain('[REDACTED_EMAIL]');
  });

  it('should propagate error if repo.save throws', async () => {
    repo.save.mockRejectedValue(new Error('DB error'));

    await expect(
      service.record({
        academyId: 'academy-1',
        actorUserId: 'user-1',
        action: 'STUDENT_CREATED',
        entityType: 'STUDENT',
        entityId: 'student-1',
      }),
    ).rejects.toThrow('DB error');
  });

  it('should handle undefined context', async () => {
    await service.record({
      academyId: 'academy-1',
      actorUserId: 'user-1',
      action: 'STUDENT_DELETED',
      entityType: 'STUDENT',
      entityId: 'student-1',
    });

    const savedLog = repo.save.mock.calls[0]![0]!;
    expect(savedLog.context).toBeNull();
  });
});
