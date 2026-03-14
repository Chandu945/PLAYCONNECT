import { CreateBatchUseCase } from './create-batch.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import { User } from '@domain/identity/entities/user.entity';
import { Batch } from '@domain/batch/entities/batch.entity';

function createOwner(academyId: string | null = 'academy-1'): User {
  const user = User.create({
    id: 'owner-1',
    fullName: 'Owner User',
    email: 'owner@example.com',
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

  const batchRepo: jest.Mocked<BatchRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByAcademyAndName: jest.fn(),
    listByAcademy: jest.fn(),
    deleteById: jest.fn(),
  };

  return { userRepo, batchRepo };
}

describe('CreateBatchUseCase', () => {
  it('should create a batch successfully', async () => {
    const { userRepo, batchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-1'));
    batchRepo.findByAcademyAndName.mockResolvedValue(null);

    const uc = new CreateBatchUseCase(userRepo, batchRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      batchName: 'Morning Batch',
      days: ['MON', 'WED', 'FRI'],
      notes: 'Beginner level',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.batchName).toBe('Morning Batch');
      expect(result.value.days).toEqual(['MON', 'WED', 'FRI']);
      expect(result.value.academyId).toBe('academy-1');
      expect(result.value.notes).toBe('Beginner level');
    }
    expect(batchRepo.save).toHaveBeenCalled();
  });

  it('should allow STAFF to create batch', async () => {
    const { userRepo, batchRepo } = buildDeps();
    const staff = User.create({
      id: 'staff-1',
      fullName: 'Staff User',
      email: 'staff@example.com',
      phoneNumber: '+919876543211',
      role: 'STAFF',
      passwordHash: 'hashed',
    });
    userRepo.findById.mockResolvedValue(
      User.reconstitute('staff-1', { ...staff['props'], academyId: 'academy-1' }),
    );
    batchRepo.findByAcademyAndName.mockResolvedValue(null);

    const uc = new CreateBatchUseCase(userRepo, batchRepo);
    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      batchName: 'Morning Batch',
      days: ['MON'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.batchName).toBe('Morning Batch');
      expect(result.value.academyId).toBe('academy-1');
    }
  });

  it('should reject when owner has no academy', async () => {
    const { userRepo, batchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner(null));

    const uc = new CreateBatchUseCase(userRepo, batchRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      batchName: 'Morning Batch',
      days: ['MON'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACADEMY_SETUP_REQUIRED');
    }
  });

  it('should reject duplicate name in same academy (409)', async () => {
    const { userRepo, batchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-1'));
    batchRepo.findByAcademyAndName.mockResolvedValue(
      Batch.create({
        id: 'existing',
        academyId: 'academy-1',
        batchName: 'Morning Batch',
        days: ['MON'],
      }),
    );

    const uc = new CreateBatchUseCase(userRepo, batchRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      batchName: 'Morning Batch',
      days: ['MON'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should allow same name in different academy', async () => {
    const { userRepo, batchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-2'));
    batchRepo.findByAcademyAndName.mockResolvedValue(null);

    const uc = new CreateBatchUseCase(userRepo, batchRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      batchName: 'Morning Batch',
      days: ['MON'],
    });

    expect(result.ok).toBe(true);
  });

  it('should allow batch with no days (days are optional)', async () => {
    const { userRepo, batchRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-1'));
    batchRepo.findByAcademyAndName.mockResolvedValue(null);

    const uc = new CreateBatchUseCase(userRepo, batchRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      batchName: 'Morning Batch',
      days: [],
    });

    expect(result.ok).toBe(true);
  });
});
