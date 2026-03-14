import { ListAuditLogsUseCase } from './list-audit-logs.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import { User } from '@domain/identity/entities/user.entity';
import { AuditLog } from '@domain/audit/entities/audit-log.entity';

function createOwner(academyId: string | null = 'academy-1'): User {
  const user = User.create({
    id: 'owner-1',
    fullName: 'Owner',
    email: 'owner@test.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
  if (academyId) {
    return User.reconstitute('owner-1', { ...user['props'], academyId });
  }
  return user;
}

function buildDeps() {
  const userRepo: jest.Mocked<UserRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    updateAcademyId: jest.fn(),
    listByAcademyAndRole: jest.fn(),
    incrementTokenVersionByAcademyId: jest.fn(),
    incrementTokenVersionByUserId: jest.fn(),
    listByAcademyId: jest.fn(),
  };

  const auditLogRepo: jest.Mocked<AuditLogRepository> = {
    save: jest.fn(),
    listByAcademy: jest.fn(),
  };

  return { userRepo, auditLogRepo };
}

describe('ListAuditLogsUseCase', () => {
  it('should return paginated audit logs for OWNER', async () => {
    const { userRepo, auditLogRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());

    const log = AuditLog.create({
      academyId: 'academy-1',
      actorUserId: 'owner-1',
      action: 'STUDENT_CREATED',
      entityType: 'STUDENT',
      entityId: 'student-1',
      context: { fullName: 'Test' },
    });

    auditLogRepo.listByAcademy.mockResolvedValue({
      items: [log],
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });

    const uc = new ListAuditLogsUseCase(userRepo, auditLogRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      page: 1,
      pageSize: 20,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.items).toHaveLength(1);
      expect(result.value.items[0]!.action).toBe('STUDENT_CREATED');
      expect(result.value.meta.totalItems).toBe(1);
    }
  });

  it('should reject STAFF role', async () => {
    const { userRepo, auditLogRepo } = buildDeps();
    const uc = new ListAuditLogsUseCase(userRepo, auditLogRepo);

    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      page: 1,
      pageSize: 20,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject SUPER_ADMIN role', async () => {
    const { userRepo, auditLogRepo } = buildDeps();
    const uc = new ListAuditLogsUseCase(userRepo, auditLogRepo);

    const result = await uc.execute({
      actorUserId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
      page: 1,
      pageSize: 20,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject OWNER without academy', async () => {
    const { userRepo, auditLogRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner(null));

    const uc = new ListAuditLogsUseCase(userRepo, auditLogRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      page: 1,
      pageSize: 20,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACADEMY_SETUP_REQUIRED');
    }
  });

  it('should pass filter params to repository', async () => {
    const { userRepo, auditLogRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    auditLogRepo.listByAcademy.mockResolvedValue({
      items: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    });

    const uc = new ListAuditLogsUseCase(userRepo, auditLogRepo);
    await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      page: 2,
      pageSize: 10,
      from: '2024-03-01',
      to: '2024-03-31',
      action: 'STUDENT_CREATED',
      entityType: 'STUDENT',
    });

    expect(auditLogRepo.listByAcademy).toHaveBeenCalledWith('academy-1', {
      page: 2,
      pageSize: 10,
      from: '2024-03-01',
      to: '2024-03-31',
      action: 'STUDENT_CREATED',
      entityType: 'STUDENT',
    });
  });
});
