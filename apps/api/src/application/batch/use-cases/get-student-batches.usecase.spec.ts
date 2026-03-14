import { GetStudentBatchesUseCase } from './get-student-batches.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { Batch } from '@domain/batch/entities/batch.entity';
import { StudentBatch } from '@domain/batch/entities/student-batch.entity';

function createMockUser(): User {
  const user = User.create({
    id: 'user-1',
    fullName: 'Owner',
    email: 'owner@test.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hash',
  });
  return User.reconstitute('user-1', { ...user['props'], academyId: 'academy-1' });
}

function createMockStudent(): Student {
  return Student.create({
    id: 'student-1',
    academyId: 'academy-1',
    fullName: 'Test Student',
    dateOfBirth: new Date('2010-01-01'),
    gender: 'MALE',
    address: { line1: '123 St', city: 'Mumbai', state: 'MH', pincode: '400001' },
    guardian: { name: 'Parent', mobile: '+919876543211', email: 'parent@test.com' },
    joiningDate: new Date('2024-01-01'),
    monthlyFee: 1000,
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
    countByBatchId: jest.fn(),
  };

  return { userRepo, studentRepo, batchRepo, studentBatchRepo };
}

describe('GetStudentBatchesUseCase', () => {
  it('should return batches for a student', async () => {
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createMockUser());
    deps.studentRepo.findById.mockResolvedValue(createMockStudent());
    deps.studentBatchRepo.findByStudentId.mockResolvedValue([
      StudentBatch.create({ id: 'sb-1', studentId: 'student-1', batchId: 'batch-1', academyId: 'academy-1' }),
      StudentBatch.create({ id: 'sb-2', studentId: 'student-1', batchId: 'batch-2', academyId: 'academy-1' }),
    ]);
    deps.batchRepo.findById.mockImplementation(async (id) =>
      Batch.create({ id, academyId: 'academy-1', batchName: `Batch ${id}`, days: ['MON'] }),
    );

    const uc = new GetStudentBatchesUseCase(
      deps.userRepo,
      deps.studentRepo,
      deps.batchRepo,
      deps.studentBatchRepo,
    );

    const result = await uc.execute({
      actorUserId: 'user-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('should return empty array when no batches assigned', async () => {
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createMockUser());
    deps.studentRepo.findById.mockResolvedValue(createMockStudent());
    deps.studentBatchRepo.findByStudentId.mockResolvedValue([]);

    const uc = new GetStudentBatchesUseCase(
      deps.userRepo,
      deps.studentRepo,
      deps.batchRepo,
      deps.studentBatchRepo,
    );

    const result = await uc.execute({
      actorUserId: 'user-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('should return error for non-existent student', async () => {
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createMockUser());
    deps.studentRepo.findById.mockResolvedValue(null);

    const uc = new GetStudentBatchesUseCase(
      deps.userRepo,
      deps.studentRepo,
      deps.batchRepo,
      deps.studentBatchRepo,
    );

    const result = await uc.execute({
      actorUserId: 'user-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should return error for student in different academy', async () => {
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createMockUser());
    const otherStudent = Student.create({
      id: 'student-1',
      academyId: 'other-academy',
      fullName: 'Other Student',
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'Mumbai', state: 'MH', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543211', email: 'parent@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: 1000,
    });
    deps.studentRepo.findById.mockResolvedValue(otherStudent);

    const uc = new GetStudentBatchesUseCase(
      deps.userRepo,
      deps.studentRepo,
      deps.batchRepo,
      deps.studentBatchRepo,
    );

    const result = await uc.execute({
      actorUserId: 'user-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should return error for unauthorized role', async () => {
    const deps = buildDeps();

    const uc = new GetStudentBatchesUseCase(
      deps.userRepo,
      deps.studentRepo,
      deps.batchRepo,
      deps.studentBatchRepo,
    );

    const result = await uc.execute({
      actorUserId: 'user-1',
      actorRole: 'SUPER_ADMIN',
      studentId: 'student-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });
});
