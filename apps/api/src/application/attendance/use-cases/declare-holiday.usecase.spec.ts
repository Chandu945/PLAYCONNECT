import { DeclareHolidayUseCase } from './declare-holiday.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import { User } from '@domain/identity/entities/user.entity';
import { Holiday } from '@domain/attendance/entities/holiday.entity';

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
  const holidayRepo: jest.Mocked<HolidayRepository> = {
    save: jest.fn(),
    findByAcademyAndDate: jest.fn(),
    deleteByAcademyAndDate: jest.fn(),
    findByAcademyAndMonth: jest.fn(),
  };
  const attendanceRepo: jest.Mocked<StudentAttendanceRepository> = {
    save: jest.fn(),
    deleteByAcademyStudentDate: jest.fn(),
    findByAcademyStudentDate: jest.fn(),
    findAbsentByAcademyAndDate: jest.fn(),
    findAbsentByAcademyStudentAndMonth: jest.fn(),
    findAbsentByAcademyAndMonth: jest.fn(),
    deleteByAcademyAndDate: jest.fn(),
    countAbsentByAcademyAndDate: jest.fn(),
  };
  return { userRepo, holidayRepo, attendanceRepo };
}

describe('DeclareHolidayUseCase', () => {
  it('should declare a holiday successfully', async () => {
    const { userRepo, holidayRepo, attendanceRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

    const uc = new DeclareHolidayUseCase(userRepo, holidayRepo, attendanceRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      date: '2024-03-26',
      reason: 'Republic Day',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.date).toBe('2024-03-26');
      expect(result.value.reason).toBe('Republic Day');
    }
    expect(holidayRepo.save).toHaveBeenCalled();
    expect(attendanceRepo.deleteByAcademyAndDate).toHaveBeenCalledWith('academy-1', '2024-03-26');
  });

  it('should be idempotent when holiday already exists', async () => {
    const { userRepo, holidayRepo, attendanceRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    holidayRepo.findByAcademyAndDate.mockResolvedValue(
      Holiday.create({
        id: 'h-1',
        academyId: 'academy-1',
        date: '2024-03-26',
        reason: 'Republic Day',
        declaredByUserId: 'owner-1',
      }),
    );

    const uc = new DeclareHolidayUseCase(userRepo, holidayRepo, attendanceRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      date: '2024-03-26',
    });

    expect(result.ok).toBe(true);
    expect(holidayRepo.save).not.toHaveBeenCalled();
  });

  it('should reject STAFF from declaring holidays (403)', async () => {
    const { userRepo, holidayRepo, attendanceRepo } = buildDeps();

    const uc = new DeclareHolidayUseCase(userRepo, holidayRepo, attendanceRepo);
    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      date: '2024-03-26',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject when no academy', async () => {
    const { userRepo, holidayRepo, attendanceRepo } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner(null));

    const uc = new DeclareHolidayUseCase(userRepo, holidayRepo, attendanceRepo);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      date: '2024-03-26',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ACADEMY_SETUP_REQUIRED');
    }
  });

  it('should reject invalid date', async () => {
    const { userRepo, holidayRepo, attendanceRepo } = buildDeps();

    const uc = new DeclareHolidayUseCase(userRepo, holidayRepo, attendanceRepo);
    userRepo.findById.mockResolvedValue(createOwner());

    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      date: 'invalid',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
