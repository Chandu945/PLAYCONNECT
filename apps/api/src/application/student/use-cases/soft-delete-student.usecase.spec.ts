import { SoftDeleteStudentUseCase } from './soft-delete-student.usecase';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { markDeleted, updateAuditFields } from '@shared/kernel';

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

function createStudent(academyId = 'academy-1', deleted = false): Student {
  const student = Student.create({
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

  if (deleted) {
    return Student.reconstitute('student-1', {
      ...student['props'],
      audit: updateAuditFields(student.audit),
      softDelete: markDeleted('owner-1'),
    });
  }

  return student;
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

describe('SoftDeleteStudentUseCase', () => {
  it('should soft delete a student', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());

    const uc = new SoftDeleteStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('student-1');
    }
    expect(studentRepo.save).toHaveBeenCalled();
    const savedStudent = studentRepo.save.mock.calls[0]?.[0];
    expect(savedStudent?.isDeleted()).toBe(true);
  });

  it('should reject STAFF from deleting', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    const uc = new SoftDeleteStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject deleting already-deleted student', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent('academy-1', true));

    const uc = new SoftDeleteStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject cross-academy delete', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-2'));
    studentRepo.findById.mockResolvedValue(createStudent('academy-1'));

    const uc = new SoftDeleteStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject when student not found', async () => {
    const { userRepo, studentRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(null);

    const uc = new SoftDeleteStudentUseCase(userRepo, studentRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'nonexistent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
