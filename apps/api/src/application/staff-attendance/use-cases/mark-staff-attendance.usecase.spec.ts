import { MarkStaffAttendanceUseCase } from './mark-staff-attendance.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StaffAttendanceRepository } from '@domain/staff-attendance/ports/staff-attendance.repository';
import { User } from '@domain/identity/entities/user.entity';

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const TODAY = todayStr();

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

function createStaff(
  id = 'staff-1',
  academyId = 'academy-1',
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): User {
  const user = User.create({
    id,
    fullName: 'Test Staff',
    email: `${id}@example.com`,
    phoneNumber: '+919876543211',
    role: 'STAFF',
    passwordHash: 'hashed',
  });
  return User.reconstitute(id, { ...user['props'], academyId, status });
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
  const staffAttendanceRepo: jest.Mocked<StaffAttendanceRepository> = {
    save: jest.fn(),
    deleteByAcademyStaffDate: jest.fn(),
    findAbsentByAcademyAndDate: jest.fn(),
    findAbsentByAcademyDateAndStaffIds: jest.fn().mockResolvedValue([]),
    findAbsentByAcademyAndMonth: jest.fn(),
    countAbsentByAcademyStaffAndMonth: jest.fn(),
  };
  const auditRecorder = { record: jest.fn() };
  return { userRepo, staffAttendanceRepo, auditRecorder };
}

describe('MarkStaffAttendanceUseCase', () => {
  it('should create absent record when marking ABSENT', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'owner-1') return createOwner();
      if (id === 'staff-1') return createStaff();
      return null;
    });

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      staffUserId: 'staff-1',
      date: TODAY,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('ABSENT');
      expect(result.value.staffUserId).toBe('staff-1');
      expect(result.value.date).toBe(TODAY);
    }
    expect(staffAttendanceRepo.save).toHaveBeenCalled();
  });

  it('should delete absent record when marking PRESENT', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'owner-1') return createOwner();
      if (id === 'staff-1') return createStaff();
      return null;
    });

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      staffUserId: 'staff-1',
      date: TODAY,
      status: 'PRESENT',
    });

    expect(result.ok).toBe(true);
    expect(staffAttendanceRepo.deleteByAcademyStaffDate).toHaveBeenCalledWith(
      'academy-1',
      'staff-1',
      TODAY,
    );
  });

  it('should reject STAFF role from marking staff attendance (FORBIDDEN)', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      staffUserId: 'staff-2',
      date: TODAY,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject cross-academy marking (FORBIDDEN)', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'owner-1') return createOwner('academy-1');
      if (id === 'staff-1') return createStaff('staff-1', 'academy-2');
      return null;
    });

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      staffUserId: 'staff-1',
      date: TODAY,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject marking for inactive staff (CONFLICT)', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'owner-1') return createOwner();
      if (id === 'staff-1') return createStaff('staff-1', 'academy-1', 'INACTIVE');
      return null;
    });

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      staffUserId: 'staff-1',
      date: TODAY,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject staff not found (NOT_FOUND)', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockImplementation(async (id: string) => {
      if (id === 'owner-1') return createOwner();
      return null;
    });

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      staffUserId: 'staff-999',
      date: TODAY,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should reject invalid date format (VALIDATION_ERROR)', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      staffUserId: 'staff-1',
      date: 'bad-date',
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('should reject owner without academy (ACADEMY_SETUP_REQUIRED)', async () => {
    const { userRepo, staffAttendanceRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner(null));

    const uc = new MarkStaffAttendanceUseCase(userRepo, staffAttendanceRepo, auditRecorder);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      staffUserId: 'staff-1',
      date: TODAY,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACADEMY_SETUP_REQUIRED');
    }
  });
});
