import { UpdateStudentUseCase } from './update-student.usecase';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';

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

function createStudent(academyId = 'academy-1'): Student {
  return Student.create({
    id: 'student-1',
    academyId,
    fullName: 'Arun Sharma',
    dateOfBirth: new Date('2010-05-15'),
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
    joiningDate: new Date('2024-01-01'),
    monthlyFee: 500,
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

describe('UpdateStudentUseCase', () => {
  it('should update student name', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());

    const uc = new UpdateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      fullName: 'Updated Name',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fullName).toBe('Updated Name');
    }
    expect(studentRepo.save).toHaveBeenCalled();
  });

  it('should allow OWNER to change monthly fee', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());

    const uc = new UpdateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      monthlyFee: 1000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.monthlyFee).toBe(1000);
    }
  });

  it('should reject STAFF from changing monthly fee', async () => {
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
    studentRepo.findById.mockResolvedValue(createStudent());

    const uc = new UpdateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 'student-1',
      monthlyFee: 1000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject cross-academy update', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-2'));
    studentRepo.findById.mockResolvedValue(createStudent('academy-1'));

    const uc = new UpdateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      fullName: 'Updated',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject update of not-found student', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(null);

    const uc = new UpdateStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'nonexistent',
      fullName: 'Updated',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
