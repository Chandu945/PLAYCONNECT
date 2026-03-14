import { CreateStudentUseCase } from './create-student.usecase';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
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

  const studentRepo: jest.Mocked<StudentRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    listActiveByAcademy: jest.fn(),
    countActiveByAcademy: jest.fn(),
    findByIds: jest.fn(),
    findBirthdaysByAcademy: jest.fn(),
    countInactiveByAcademy: jest.fn(),
    countNewAdmissionsByAcademyAndDateRange: jest.fn(),
  };

  const auditRecorder = { record: jest.fn() };

  return { userRepo, studentRepo, auditRecorder };
}

const validInput = {
  actorUserId: 'owner-1',
  actorRole: 'OWNER' as const,
  fullName: 'Arun Sharma',
  dateOfBirth: '2010-05-15',
  gender: 'MALE',
  address: {
    line1: '123 Main Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
  },
  guardian: {
    name: 'Raj Sharma',
    mobile: '+919876543210',
    email: 'raj@example.com',
  },
  joiningDate: '2024-01-01',
  monthlyFee: 500,
};

describe('CreateStudentUseCase', () => {
  it('should create a student successfully', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());

    const uc = new CreateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute(validInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fullName).toBe('Arun Sharma');
      expect(result.value.gender).toBe('MALE');
      expect(result.value.status).toBe('ACTIVE');
      expect(result.value.academyId).toBe('academy-1');
      expect(result.value.monthlyFee).toBe(500);
    }
    expect(studentRepo.save).toHaveBeenCalled();
  });

  it('should allow STAFF to create students', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
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

    const uc = new CreateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({ ...validInput, actorUserId: 'staff-1', actorRole: 'STAFF' });

    expect(result.ok).toBe(true);
  });

  it('should reject SUPER_ADMIN', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    const uc = new CreateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      ...validInput,
      actorUserId: 'admin-1',
      actorRole: 'SUPER_ADMIN',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject when actor has no academy', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner(null));

    const uc = new CreateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute(validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACADEMY_SETUP_REQUIRED');
    }
  });

  it('should reject invalid gender', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());

    const uc = new CreateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({ ...validInput, gender: 'UNKNOWN' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('should reject non-integer monthly fee', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());

    const uc = new CreateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({ ...validInput, monthlyFee: 99.5 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('should reject invalid pincode', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());

    const uc = new CreateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      ...validInput,
      address: { ...validInput.address, pincode: '12345' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
