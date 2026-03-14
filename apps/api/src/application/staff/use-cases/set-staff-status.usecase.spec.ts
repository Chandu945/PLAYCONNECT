import { SetStaffStatusUseCase } from './set-staff-status.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { User } from '@domain/identity/entities/user.entity';

function createOwner(academyId = 'academy-1'): User {
  const user = User.create({
    id: 'owner-1',
    fullName: 'Owner User',
    email: 'owner@example.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
  return User.reconstitute('owner-1', {
    ...user['props'],
    academyId,
  });
}

function createStaff(status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE', academyId = 'academy-1'): User {
  const user = User.create({
    id: 'staff-1',
    fullName: 'Staff User',
    email: 'staff@example.com',
    phoneNumber: '+919876543211',
    role: 'STAFF',
    passwordHash: 'hashed',
  });
  return User.reconstitute('staff-1', {
    ...user['props'],
    status,
    academyId,
  });
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
  return { userRepo };
}

describe('SetStaffStatusUseCase', () => {
  it('should deactivate active staff', async () => {
    const { userRepo } = buildDeps();
    userRepo.findById.mockImplementation(async (id) => {
      if (id === 'owner-1') return createOwner();
      if (id === 'staff-1') return createStaff('ACTIVE');
      return null;
    });

    const uc = new SetStaffStatusUseCase(userRepo);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      staffId: 'staff-1',
      status: 'INACTIVE',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('INACTIVE');
    }
    expect(userRepo.save).toHaveBeenCalled();
  });

  it('should activate inactive staff', async () => {
    const { userRepo } = buildDeps();
    userRepo.findById.mockImplementation(async (id) => {
      if (id === 'owner-1') return createOwner();
      if (id === 'staff-1') return createStaff('INACTIVE');
      return null;
    });

    const uc = new SetStaffStatusUseCase(userRepo);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      staffId: 'staff-1',
      status: 'ACTIVE',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('ACTIVE');
    }
  });

  it('should reject non-OWNER', async () => {
    const { userRepo } = buildDeps();
    const uc = new SetStaffStatusUseCase(userRepo);
    const result = await uc.execute({
      ownerUserId: 'staff-1',
      ownerRole: 'STAFF',
      staffId: 'staff-2',
      status: 'INACTIVE',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject cross-academy staff', async () => {
    const { userRepo } = buildDeps();
    userRepo.findById.mockImplementation(async (id) => {
      if (id === 'owner-1') return createOwner('academy-1');
      if (id === 'staff-1') return createStaff('ACTIVE', 'academy-2');
      return null;
    });

    const uc = new SetStaffStatusUseCase(userRepo);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      staffId: 'staff-1',
      status: 'INACTIVE',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject when staff not found', async () => {
    const { userRepo } = buildDeps();
    userRepo.findById.mockImplementation(async (id) => {
      if (id === 'owner-1') return createOwner();
      return null;
    });

    const uc = new SetStaffStatusUseCase(userRepo);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      staffId: 'nonexistent',
      status: 'INACTIVE',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
