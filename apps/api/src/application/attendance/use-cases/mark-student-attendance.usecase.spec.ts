import { MarkStudentAttendanceUseCase } from './mark-student-attendance.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { Holiday } from '@domain/attendance/entities/holiday.entity';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';

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

function createStudent(academyId = 'academy-1'): Student {
  return Student.create({
    id: 'student-1',
    academyId,
    fullName: 'Arun Sharma',
    dateOfBirth: new Date('2010-05-15'),
    gender: 'MALE',
    address: { line1: '123 Main St', city: 'Mumbai', state: 'MH', pincode: '400001' },
    guardian: { name: 'Raj', mobile: '+919876543210', email: 'raj@example.com' },
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
  const holidayRepo: jest.Mocked<HolidayRepository> = {
    save: jest.fn(),
    findByAcademyAndDate: jest.fn(),
    deleteByAcademyAndDate: jest.fn(),
    findByAcademyAndMonth: jest.fn(),
  };
  const auditRecorder = { record: jest.fn() };
  return { userRepo, studentRepo, attendanceRepo, holidayRepo, auditRecorder };
}

describe('MarkStudentAttendanceUseCase', () => {
  it('should create absent record when marking ABSENT', async () => {
    const { userRepo, studentRepo, attendanceRepo, holidayRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());
    holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    attendanceRepo.findByAcademyStudentDate.mockResolvedValue(null);

    const uc = new MarkStudentAttendanceUseCase(
      userRepo,
      studentRepo,
      attendanceRepo,
      holidayRepo,
      auditRecorder,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      date: '2024-03-15',
      status: 'ABSENT',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('ABSENT');
    }
    expect(attendanceRepo.save).toHaveBeenCalled();
  });

  it('should delete absent record when marking PRESENT', async () => {
    const { userRepo, studentRepo, attendanceRepo, holidayRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());
    holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

    const uc = new MarkStudentAttendanceUseCase(
      userRepo,
      studentRepo,
      attendanceRepo,
      holidayRepo,
      auditRecorder,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      date: '2024-03-15',
      status: 'PRESENT',
    });

    expect(result.ok).toBe(true);
    expect(attendanceRepo.deleteByAcademyStudentDate).toHaveBeenCalledWith(
      'academy-1',
      'student-1',
      '2024-03-15',
    );
  });

  it('should be idempotent when marking absent twice', async () => {
    const { userRepo, studentRepo, attendanceRepo, holidayRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());
    holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    attendanceRepo.findByAcademyStudentDate.mockResolvedValue(
      StudentAttendance.create({
        id: 'att-1',
        academyId: 'academy-1',
        studentId: 'student-1',
        date: '2024-03-15',
        markedByUserId: 'owner-1',
      }),
    );

    const uc = new MarkStudentAttendanceUseCase(
      userRepo,
      studentRepo,
      attendanceRepo,
      holidayRepo,
      auditRecorder,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      date: '2024-03-15',
      status: 'ABSENT',
    });

    expect(result.ok).toBe(true);
    expect(attendanceRepo.save).not.toHaveBeenCalled();
  });

  it('should reject marking on a holiday (409)', async () => {
    const { userRepo, studentRepo, attendanceRepo, holidayRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());
    holidayRepo.findByAcademyAndDate.mockResolvedValue(
      Holiday.create({
        id: 'h-1',
        academyId: 'academy-1',
        date: '2024-03-15',
        declaredByUserId: 'owner-1',
      }),
    );

    const uc = new MarkStudentAttendanceUseCase(
      userRepo,
      studentRepo,
      attendanceRepo,
      holidayRepo,
      auditRecorder,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      date: '2024-03-15',
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject cross-academy marking', async () => {
    const { userRepo, studentRepo, attendanceRepo, holidayRepo, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner('academy-2'));
    studentRepo.findById.mockResolvedValue(createStudent('academy-1'));
    holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

    const uc = new MarkStudentAttendanceUseCase(
      userRepo,
      studentRepo,
      attendanceRepo,
      holidayRepo,
      auditRecorder,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      date: '2024-03-15',
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject invalid date format', async () => {
    const deps = buildDeps();
    const uc = new MarkStudentAttendanceUseCase(
      deps.userRepo,
      deps.studentRepo,
      deps.attendanceRepo,
      deps.holidayRepo,
      deps.auditRecorder,
    );
    deps.userRepo.findById.mockResolvedValue(createOwner());

    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      date: 'bad-date',
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
