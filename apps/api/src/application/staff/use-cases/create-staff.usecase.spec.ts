import { CreateStaffUseCase } from './create-staff.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { PasswordHasher } from '../../identity/ports/password-hasher.port';
import { User } from '@domain/identity/entities/user.entity';

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
    return User.reconstitute('owner-1', {
      ...user['props'],
      academyId,
    });
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

  const hasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn().mockResolvedValue('hashed-pw'),
    compare: jest.fn(),
  };

  return { userRepo, hasher };
}

describe('CreateStaffUseCase', () => {
  it('should create staff with role=STAFF, status=ACTIVE, correct academyId', async () => {
    const { userRepo, hasher } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-1'));
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.findByPhone.mockResolvedValue(null);

    const uc = new CreateStaffUseCase(userRepo, hasher);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      fullName: 'Staff User',
      email: 'staff@example.com',
      phoneNumber: '+919876543211',
      password: 'Password1!',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.role).toBe('STAFF');
      expect(result.value.status).toBe('ACTIVE');
      expect(result.value.academyId).toBe('academy-1');
      expect(result.value.fullName).toBe('Staff User');
      expect(result.value.email).toBe('staff@example.com');
    }
    expect(userRepo.save).toHaveBeenCalled();
    expect(hasher.hash).toHaveBeenCalledWith('Password1!');
  });

  it('should reject non-OWNER', async () => {
    const { userRepo, hasher } = buildDeps();
    const uc = new CreateStaffUseCase(userRepo, hasher);
    const result = await uc.execute({
      ownerUserId: 'staff-1',
      ownerRole: 'STAFF',
      fullName: 'New Staff',
      email: 'new@example.com',
      phoneNumber: '+919876543211',
      password: 'Password1!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject when owner has no academy', async () => {
    const { userRepo, hasher } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner(null));

    const uc = new CreateStaffUseCase(userRepo, hasher);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      fullName: 'Staff User',
      email: 'staff@example.com',
      phoneNumber: '+919876543211',
      password: 'Password1!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACADEMY_SETUP_REQUIRED');
    }
  });

  it('should reject duplicate email', async () => {
    const { userRepo, hasher } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-1'));
    userRepo.findByEmail.mockResolvedValue(createOwner('academy-1'));

    const uc = new CreateStaffUseCase(userRepo, hasher);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      fullName: 'Staff User',
      email: 'owner@example.com',
      phoneNumber: '+919876543211',
      password: 'Password1!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject duplicate phone', async () => {
    const { userRepo, hasher } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-1'));
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.findByPhone.mockResolvedValue(createOwner('academy-1'));

    const uc = new CreateStaffUseCase(userRepo, hasher);
    const result = await uc.execute({
      ownerUserId: 'owner-1',
      ownerRole: 'OWNER',
      fullName: 'Staff User',
      email: 'staff@example.com',
      phoneNumber: '+919876543210',
      password: 'Password1!',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });
});
