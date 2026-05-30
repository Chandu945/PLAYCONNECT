import { MarkStudentAttendanceUseCase } from './mark-student-attendance.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { AbsenceNotificationSchedulerPort } from '../../notifications/ports/absence-notification-scheduler.port';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { Holiday } from '@domain/attendance/entities/holiday.entity';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';
import { Batch } from '@domain/batch/entities/batch.entity';
import { StudentBatch } from '@domain/batch/entities/student-batch.entity';
import { formatLocalDate } from '@shared/date-utils';

/** Return today's date as YYYY-MM-DD (IST-aware). */
function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

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

function createBatch(id = 'batch-1', academyId = 'academy-1'): Batch {
  return Batch.create({
    id,
    academyId,
    batchName: 'Morning',
    days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  });
}

function createEnrollment(
  studentId = 'student-1',
  batchId = 'batch-1',
  academyId = 'academy-1',
): StudentBatch {
  // BUG-032: production enrollments are normally weeks/months in the past
  // by the time anyone marks attendance. The default `StudentBatch.create()`
  // stamps assignedAt = now(), which would make every backfill-date test
  // trip the enrollment-date guard. reconstitute() lets us drop the stamp
  // a year back so the fixture mirrors realistic data.
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  return StudentBatch.reconstitute(`${studentId}_${batchId}`, {
    studentId,
    batchId,
    academyId,
    assignedAt: yearAgo,
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
    countActiveByAcademyAndRole: jest.fn().mockResolvedValue(0),
    incrementTokenVersionByAcademyId: jest.fn(),
    incrementTokenVersionByUserId: jest.fn(),
    listByAcademyId: jest.fn(),
    anonymizeAndSoftDelete: jest.fn(),
    listParentIdsByAcademy: jest.fn().mockResolvedValue([]),
  };
  const studentRepo: jest.Mocked<StudentRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    listActiveByAcademy: jest.fn(),
    countActiveByAcademy: jest.fn(),
    countScheduledStudentsByAcademyAndDate: jest.fn().mockResolvedValue(0),
    findByIds: jest.fn(),
    findBirthdaysByAcademy: jest.fn(),
    findByEmailInAcademy: jest.fn(),
    findByPhoneInAcademy: jest.fn(),
    countInactiveByAcademy: jest.fn(),
    countNewAdmissionsByAcademyAndDateRange: jest.fn(),
    saveWithVersionPrecondition: jest.fn().mockResolvedValue(true),
  };
  const attendanceRepo: jest.Mocked<StudentAttendanceRepository> = {
    save: jest.fn(),
    deleteByAcademyStudentBatchDate: jest.fn(),
    findByAcademyStudentBatchDate: jest.fn(),
    findPresentByAcademyBatchAndDate: jest.fn(),
    findPresentByAcademyAndDate: jest.fn(),
    findAbsentByAcademyAndDate: jest.fn().mockResolvedValue([]),
    findPresentByAcademyStudentAndMonth: jest.fn(),
    findAbsentByAcademyStudentAndMonth: jest.fn().mockResolvedValue([]),
    findPresentByAcademyAndMonth: jest.fn(),
    deleteByAcademyAndDate: jest.fn(),
    countPresentByAcademyAndDate: jest.fn(),
    countDistinctStudentsPresentByAcademyAndDate: jest.fn(),
    countDistinctStudentsAbsentByAcademyAndDate: jest.fn().mockResolvedValue(0),
    countDistinctStudentsAbsentInAllScheduledBatchesByAcademyAndDate: jest.fn().mockResolvedValue(0),
    findAbsentByAcademyAndMonth: jest.fn().mockResolvedValue([]),
    deleteAllByAcademyAndStudent: jest.fn(),
  };
  const holidayRepo: jest.Mocked<HolidayRepository> = {
    save: jest.fn(),
    findByAcademyAndDate: jest.fn(),
    deleteByAcademyAndDate: jest.fn(),
    findByAcademyAndMonth: jest.fn(),
  };
  const batchRepo: jest.Mocked<BatchRepository> = {
    save: jest.fn(),
    findById: jest.fn().mockResolvedValue(createBatch()),
    findByIds: jest.fn().mockResolvedValue([createBatch()]),
    findByAcademyAndName: jest.fn(),
    listByAcademy: jest.fn(),
    deleteById: jest.fn(),
  };
  const studentBatchRepo: jest.Mocked<StudentBatchRepository> = {
    replaceForStudent: jest.fn(),
    findByStudentId: jest.fn().mockResolvedValue([createEnrollment()]),
    findByStudentIds: jest.fn().mockResolvedValue([createEnrollment()]),
    findByBatchId: jest.fn().mockResolvedValue([createEnrollment()]),
    deleteByBatchId: jest.fn(),
    countByBatchId: jest.fn(),
    countByBatchIds: jest.fn(),
  };
  const auditRecorder = { record: jest.fn() };
  return {
    userRepo,
    studentRepo,
    attendanceRepo,
    holidayRepo,
    batchRepo,
    studentBatchRepo,
    auditRecorder,
  };
}

function makeUseCase(
  deps: ReturnType<typeof buildDeps>,
  scheduler?: AbsenceNotificationSchedulerPort,
): MarkStudentAttendanceUseCase {
  return new MarkStudentAttendanceUseCase(
    deps.userRepo,
    deps.studentRepo,
    deps.attendanceRepo,
    deps.holidayRepo,
    deps.batchRepo,
    deps.studentBatchRepo,
    deps.auditRecorder,
    scheduler,
  );
}

describe('MarkStudentAttendanceUseCase', () => {
  // Records mean PRESENT, keyed by (academy, student, batch, date). Absence = no record.
  it('creates a present record when marking PRESENT', async () => {
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    deps.attendanceRepo.findByAcademyStudentBatchDate.mockResolvedValue(null);

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'PRESENT',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PRESENT');
      expect(result.value.batchId).toBe('batch-1');
    }
    expect(deps.attendanceRepo.save).toHaveBeenCalled();
  });

  it('upserts an ABSENT record when marking ABSENT', async () => {
    // Default-present model: ABSENT marks are persisted as explicit rows
    // (status='ABSENT') rather than modelled by deletion. The use-case
    // saves the entity with status='ABSENT'; the unique-index upsert in
    // the repo merges with any existing row for the same (a,s,b,d) key.
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(true);
    expect(deps.attendanceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        academyId: 'academy-1',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
        status: 'ABSENT',
      }),
    );
    expect(deps.attendanceRepo.deleteByAcademyStudentBatchDate).not.toHaveBeenCalled();
  });

  it('is idempotent when marking PRESENT twice (existing record)', async () => {
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    deps.attendanceRepo.findByAcademyStudentBatchDate.mockResolvedValue(
      StudentAttendance.create({
        id: 'att-1',
        academyId: 'academy-1',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
        markedByUserId: 'owner-1',
      }),
    );

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'PRESENT',
    });

    expect(result.ok).toBe(true);
    expect(deps.attendanceRepo.save).not.toHaveBeenCalled();
  });

  it('M1: concurrent PRESENT marks succeed idempotently when save hits duplicate-key', async () => {
    // Two coaches tap "Present" on the same student within milliseconds.
    // Both pass the existence check (record not yet committed), both try to
    // insert. The second insert hits the unique index and Mongo throws
    // a duplicate-key error (code 11000). Without M1 this surfaced as a 500
    // to the slower coach; with M1 it's treated as idempotent success — the
    // desired state (student is PRESENT) is already achieved.
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    // First check returns null (no record yet — race window open).
    deps.attendanceRepo.findByAcademyStudentBatchDate.mockResolvedValue(null);
    // Save throws Mongo's duplicate-key error.
    const dupErr = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    deps.attendanceRepo.save.mockRejectedValueOnce(dupErr);

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'PRESENT',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PRESENT');
    }
  });

  it('M1: non-duplicate errors from save still propagate (not swallowed)', async () => {
    // Defensive: only error code 11000 is treated as idempotent — any other
    // error (real DB outage, validation failure, etc.) must still bubble so
    // it isn't silently lost.
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    deps.attendanceRepo.findByAcademyStudentBatchDate.mockResolvedValue(null);
    deps.attendanceRepo.save.mockRejectedValueOnce(new Error('Connection refused'));

    const uc = makeUseCase(deps);
    await expect(
      uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
        status: 'PRESENT',
      }),
    ).rejects.toThrow('Connection refused');
  });

  it('rejects marking on a holiday (409)', async () => {
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(
      Holiday.create({
        id: 'h-1',
        academyId: 'academy-1',
        date: today,
        declaredByUserId: 'owner-1',
      }),
    );

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('rejects cross-academy marking', async () => {
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner('academy-2'));
    deps.studentRepo.findById.mockResolvedValue(createStudent('academy-1'));
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects marking when batch belongs to another academy', async () => {
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    deps.batchRepo.findById.mockResolvedValue(createBatch('batch-1', 'academy-2'));

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'PRESENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects marking when student is not enrolled in the batch', async () => {
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    deps.studentRepo.findById.mockResolvedValue(createStudent());
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
    deps.studentBatchRepo.findByStudentId.mockResolvedValue([]);

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'PRESENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects marking an inactive student', async () => {
    const today = todayLocalDate();
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());
    const activeStudent = createStudent();
    const inactive = Student.reconstitute('student-1', {
      ...activeStudent['props'],
      status: 'INACTIVE',
    });
    deps.studentRepo.findById.mockResolvedValue(inactive);
    deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: today,
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
    expect(deps.attendanceRepo.save).not.toHaveBeenCalled();
  });

  it('rejects invalid date format', async () => {
    const deps = buildDeps();
    deps.userRepo.findById.mockResolvedValue(createOwner());

    const uc = makeUseCase(deps);
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      batchId: 'batch-1',
      date: 'bad-date',
      status: 'ABSENT',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  describe('absence-notification scheduling', () => {
    function makeScheduler(): jest.Mocked<AbsenceNotificationSchedulerPort> {
      return { schedule: jest.fn(), cancel: jest.fn() };
    }

    it('calls scheduler.schedule with the correct mark when ABSENT', async () => {
      const today = todayLocalDate();
      const deps = buildDeps();
      const scheduler = makeScheduler();
      deps.userRepo.findById.mockResolvedValue(createOwner());
      deps.studentRepo.findById.mockResolvedValue(createStudent());
      deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

      const uc = makeUseCase(deps, scheduler);
      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
        status: 'ABSENT',
      });

      expect(result.ok).toBe(true);
      expect(scheduler.schedule).toHaveBeenCalledWith({
        academyId: 'academy-1',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
      });
      expect(scheduler.cancel).not.toHaveBeenCalled();
    });

    it('calls scheduler.cancel with the correct mark when PRESENT', async () => {
      const today = todayLocalDate();
      const deps = buildDeps();
      const scheduler = makeScheduler();
      deps.userRepo.findById.mockResolvedValue(createOwner());
      deps.studentRepo.findById.mockResolvedValue(createStudent());
      deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);
      deps.attendanceRepo.findByAcademyStudentBatchDate.mockResolvedValue(null);

      const uc = makeUseCase(deps, scheduler);
      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
        status: 'PRESENT',
      });

      expect(result.ok).toBe(true);
      expect(scheduler.cancel).toHaveBeenCalledWith({
        academyId: 'academy-1',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
      });
      expect(scheduler.schedule).not.toHaveBeenCalled();
    });

    it('returns ok even if the scheduler throws — attendance write must not fail', async () => {
      const today = todayLocalDate();
      const deps = buildDeps();
      const scheduler = makeScheduler();
      scheduler.schedule.mockRejectedValue(new Error('Redis connection refused'));
      deps.userRepo.findById.mockResolvedValue(createOwner());
      deps.studentRepo.findById.mockResolvedValue(createStudent());
      deps.holidayRepo.findByAcademyAndDate.mockResolvedValue(null);

      const uc = makeUseCase(deps, scheduler);
      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: today,
        status: 'ABSENT',
      });

      expect(result.ok).toBe(true);
      // Under the default-present model, ABSENT is persisted via save() (not
      // a delete) — assert the save happened with status='ABSENT' instead.
      expect(deps.attendanceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ABSENT' }),
      );
    });
  });

  // H2 (attendance audit): allow attendance edits for INACTIVE/LEFT students
  // when the target date predates their status change. Pre-fix code blocked
  // legitimate backfills (owner forgot to mark May 20 for a student who
  // departed June 1).
  describe('H2: historical edits for non-ACTIVE students', () => {
    function createInactiveStudent(statusChangedAt: Date): Student {
      const s = createStudent();
      // Bypass the entity's normal lifecycle to construct a student in the
      // "INACTIVE since X" state directly. Uses Student.reconstitute with
      // an internal-prop override since changeStatus would set
      // statusChangedAt to now().
      return Student.reconstitute(s.id.toString(), {
        ...s['props'],
        status: 'INACTIVE',
        statusChangedAt,
      });
    }

    // Relative-to-today dates so the attendance 30-day window passes
    // regardless of when the test runs.
    function daysAgoString(days: number): string {
      const d = new Date();
      d.setDate(d.getDate() - days);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    function daysAgoDate(days: number): Date {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return d;
    }

    it('allows marking attendance for INACTIVE student when date is before statusChangedAt', async () => {
      const deps = buildDeps();
      deps.userRepo.findById.mockResolvedValue(createOwner());
      // Student went INACTIVE 5 days ago. We're marking attendance for
      // 10 days ago (before they departed). Both inside the 30-day window.
      deps.studentRepo.findById.mockResolvedValue(createInactiveStudent(daysAgoDate(5)));
      deps.batchRepo.findById.mockResolvedValue(createBatch());
      deps.studentBatchRepo.findByStudentId.mockResolvedValue([createEnrollment()]);

      const result = await makeUseCase(deps).execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: daysAgoString(10),
        status: 'PRESENT',
      });

      expect(result.ok).toBe(true);
      expect(deps.attendanceRepo.save).toHaveBeenCalled();
    });

    it('still rejects when date is on or after statusChangedAt', async () => {
      const deps = buildDeps();
      deps.userRepo.findById.mockResolvedValue(createOwner());
      // Student went INACTIVE 10 days ago. Trying to mark 5 days ago
      // (after they departed) — must be rejected.
      deps.studentRepo.findById.mockResolvedValue(createInactiveStudent(daysAgoDate(10)));
      deps.batchRepo.findById.mockResolvedValue(createBatch());

      const result = await makeUseCase(deps).execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: daysAgoString(5),
        status: 'PRESENT',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });

    it('rejects INACTIVE student with null statusChangedAt (no history to compare against)', async () => {
      const deps = buildDeps();
      deps.userRepo.findById.mockResolvedValue(createOwner());
      const s = createStudent();
      const broken = Student.reconstitute(s.id.toString(), {
        ...s['props'],
        status: 'INACTIVE',
        statusChangedAt: null,
      });
      deps.studentRepo.findById.mockResolvedValue(broken);
      deps.batchRepo.findById.mockResolvedValue(createBatch());

      const result = await makeUseCase(deps).execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        batchId: 'batch-1',
        date: daysAgoString(10),
        status: 'PRESENT',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
    });
  });
});
