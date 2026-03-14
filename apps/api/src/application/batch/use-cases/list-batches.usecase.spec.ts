import { ListBatchesUseCase } from './list-batches.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { User } from '@domain/identity/entities/user.entity';
import { Batch } from '@domain/batch/entities/batch.entity';

function createUser(role: 'OWNER' | 'STAFF', academyId: string | null = 'academy-1'): User {
  const user = User.create({
    id: `${role.toLowerCase()}-1`,
    fullName: `${role} User`,
    email: `${role.toLowerCase()}@example.com`,
    phoneNumber: '+919876543210',
    role,
    passwordHash: 'hashed',
  });
  if (academyId) {
    return User.reconstitute(user.id.toString(), { ...user['props'], academyId });
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

  const batchRepo: jest.Mocked<BatchRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByAcademyAndName: jest.fn(),
    listByAcademy: jest.fn(),
    deleteById: jest.fn(),
  };

  const studentBatchRepo: jest.Mocked<StudentBatchRepository> = {
    replaceForStudent: jest.fn(),
    findByStudentId: jest.fn(),
    findByBatchId: jest.fn(),
    deleteByBatchId: jest.fn(),
    countByBatchId: jest.fn().mockResolvedValue(0),
  };

  return { userRepo, batchRepo, studentBatchRepo };
}

describe('ListBatchesUseCase', () => {
  it('should list batches for OWNER', async () => {
    const { userRepo, batchRepo, studentBatchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createUser('OWNER'));
    const batch = Batch.create({
      id: 'batch-1',
      academyId: 'academy-1',
      batchName: 'Morning',
      days: ['MON'],
    });
    batchRepo.listByAcademy.mockResolvedValue({ batches: [batch], total: 1 });

    const uc = new ListBatchesUseCase(userRepo, batchRepo, studentBatchRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      page: 1,
      pageSize: 20,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toHaveLength(1);
      expect(result.value.meta.totalItems).toBe(1);
    }
  });

  it('should list batches for STAFF (read access)', async () => {
    const { userRepo, batchRepo, studentBatchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createUser('STAFF'));
    batchRepo.listByAcademy.mockResolvedValue({ batches: [], total: 0 });

    const uc = new ListBatchesUseCase(userRepo, batchRepo, studentBatchRepo);
    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      page: 1,
      pageSize: 20,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toHaveLength(0);
    }
  });

  it('should reject SUPER_ADMIN', async () => {
    const { userRepo, batchRepo, studentBatchRepo } = buildDeps();
    const uc = new ListBatchesUseCase(userRepo, batchRepo, studentBatchRepo);
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

  it('should reject when actor has no academy', async () => {
    const { userRepo, batchRepo, studentBatchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createUser('OWNER', null));

    const uc = new ListBatchesUseCase(userRepo, batchRepo, studentBatchRepo);
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
});
