import { BulkSetAbsencesUseCase } from './bulk-set-absences.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { AbsenceNotificationSchedulerPort } from '../../notifications/ports/absence-notification-scheduler.port';
import type { TransactionPort } from '../../common/transaction.port';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';
import { Batch } from '@domain/batch/entities/batch.entity';
import { StudentBatch } from '@domain/batch/entities/student-batch.entity';
import { formatLocalDate } from '@shared/date-utils';

const ACADEMY = 'academy-1';
const BATCH = 'batch-1';
const TODAY = formatLocalDate(new Date());

function createOwner(): User {
  const u = User.create({
    id: 'owner-1',
    fullName: 'Owner',
    email: 'o@e.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'h',
  });
  return User.reconstitute('owner-1', { ...u['props'], academyId: ACADEMY });
}

function createStudent(id: string): Student {
  return Student.create({
    id,
    academyId: ACADEMY,
    fullName: `Student ${id}`,
    dateOfBirth: new Date('2010-01-01'),
    gender: 'MALE',
    address: { line1: '1 Test St', city: 'X', state: 'Y', pincode: '500001' },
    joiningDate: new Date('2024-01-01'),
    monthlyFee: 100,
  });
}

function buildDeps(opts: { studentIds: string[]; currentPresentIds: string[] }) {
  const userRepo: jest.Mocked<Pick<UserRepository, 'findById'>> = {
    findById: jest.fn().mockResolvedValue(createOwner()),
  };
  const studentRepo: jest.Mocked<Pick<StudentRepository, 'findByIds'>> = {
    findByIds: jest.fn().mockResolvedValue(opts.studentIds.map(createStudent)),
  };
  const attendanceRepo: jest.Mocked<
    Pick<
      StudentAttendanceRepository,
      'findPresentByAcademyBatchAndDate' | 'deleteByAcademyStudentBatchDate' | 'save'
    >
  > = {
    findPresentByAcademyBatchAndDate: jest.fn().mockResolvedValue(
      opts.currentPresentIds.map((id) =>
        StudentAttendance.create({
          id: `att-${id}`,
          academyId: ACADEMY,
          studentId: id,
          batchId: BATCH,
          date: TODAY,
          markedByUserId: 'owner-1',
        }),
      ),
    ),
    deleteByAcademyStudentBatchDate: jest.fn(),
    save: jest.fn(),
  };
  const holidayRepo: jest.Mocked<Pick<HolidayRepository, 'findByAcademyAndDate'>> = {
    findByAcademyAndDate: jest.fn().mockResolvedValue(null),
  };
  const batchRepo: jest.Mocked<Pick<BatchRepository, 'findById'>> = {
    findById: jest.fn().mockResolvedValue(
      Batch.create({
        id: BATCH,
        academyId: ACADEMY,
        batchName: 'Morning',
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      }),
    ),
  };
  const studentBatchRepo: jest.Mocked<Pick<StudentBatchRepository, 'findByBatchId'>> = {
    findByBatchId: jest.fn().mockResolvedValue(
      opts.studentIds.map((id) =>
        StudentBatch.create({
          id: `${id}_${BATCH}`,
          academyId: ACADEMY,
          studentId: id,
          batchId: BATCH,
        }),
      ),
    ),
  };
  const auditRecorder = { record: jest.fn() };
  const scheduler: jest.Mocked<AbsenceNotificationSchedulerPort> = {
    schedule: jest.fn(),
    cancel: jest.fn(),
  };

  // Noop transaction — invokes the inner fn directly. Mirrors what the
  // production TransactionPort does in the happy path (sans real session
  // wiring) so the use case exercises the same wrapped code path.
  const noopTransaction: TransactionPort = {
    run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  };

  const useCase = new BulkSetAbsencesUseCase(
    userRepo as unknown as UserRepository,
    studentRepo as unknown as StudentRepository,
    attendanceRepo as unknown as StudentAttendanceRepository,
    holidayRepo as unknown as HolidayRepository,
    batchRepo as unknown as BatchRepository,
    studentBatchRepo as unknown as StudentBatchRepository,
    auditRecorder,
    noopTransaction,
    scheduler,
  );

  return { useCase, scheduler, attendanceRepo };
}

const INPUT_BASE = {
  actorUserId: 'owner-1',
  actorRole: 'OWNER' as const,
  batchId: BATCH,
  date: TODAY,
};

describe('BulkSetAbsencesUseCase — scheduler diff', () => {
  it('auto-fill fast-path: empty absent list on a fresh roll fires no scheduler calls', async () => {
    const { useCase, scheduler } = buildDeps({
      studentIds: ['s1', 's2', 's3'],
      currentPresentIds: [], // fresh roll, no PRESENT rows yet
    });

    const result = await useCase.execute({ ...INPUT_BASE, absentStudentIds: [] });

    expect(result.ok).toBe(true);
    expect(scheduler.schedule).not.toHaveBeenCalled();
    expect(scheduler.cancel).not.toHaveBeenCalled();
  });

  it('schedules a push for every student in the absent list (parity with per-tap path)', async () => {
    const { useCase, scheduler } = buildDeps({
      studentIds: ['s1', 's2', 's3'],
      currentPresentIds: ['s1', 's2', 's3'], // all currently PRESENT
    });

    const result = await useCase.execute({
      ...INPUT_BASE,
      absentStudentIds: ['s1', 's2'], // s1 + s2 now absent
    });

    expect(result.ok).toBe(true);
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);
    expect(scheduler.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 's1', batchId: BATCH, date: TODAY }),
    );
    expect(scheduler.schedule).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 's2', batchId: BATCH, date: TODAY }),
    );
    // s3 was and still is PRESENT — no schedule, no cancel.
    expect(scheduler.cancel).not.toHaveBeenCalled();
  });

  it('schedules even for students who were already absent — keeps parity with per-tap', async () => {
    // Coach uses bulk-set with one absent student on a roster where nobody
    // had a PRESENT row yet (no auto-fill, e.g. an old date the coach is
    // backfilling). Per-tap would have scheduled, so bulk must too.
    const { useCase, scheduler } = buildDeps({
      studentIds: ['s1', 's2'],
      currentPresentIds: [], // no prior PRESENT rows; s1 is "newly explicitly absent"
    });

    const result = await useCase.execute({ ...INPUT_BASE, absentStudentIds: ['s1'] });

    expect(result.ok).toBe(true);
    expect(scheduler.schedule).toHaveBeenCalledWith(expect.objectContaining({ studentId: 's1' }));
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);
  });

  it('cancels pending pushes for each student transitioning back to PRESENT', async () => {
    const { useCase, scheduler } = buildDeps({
      studentIds: ['s1', 's2', 's3'],
      currentPresentIds: ['s2'], // only s2 was PRESENT; s1 and s3 had been absent
    });

    // Mark s3 absent — s1 transitions absent→present (and gets a cancel).
    const result = await useCase.execute({ ...INPUT_BASE, absentStudentIds: ['s3'] });

    expect(result.ok).toBe(true);
    expect(scheduler.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 's1', batchId: BATCH, date: TODAY }),
    );
    // s3 in absent list → schedule (parity with per-tap).
    expect(scheduler.schedule).toHaveBeenCalledWith(expect.objectContaining({ studentId: 's3' }));
  });

  it('returns ok even when scheduler.schedule throws', async () => {
    const { useCase, scheduler } = buildDeps({
      studentIds: ['s1'],
      currentPresentIds: ['s1'],
    });
    scheduler.schedule.mockRejectedValue(new Error('Redis down'));

    const result = await useCase.execute({ ...INPUT_BASE, absentStudentIds: ['s1'] });
    expect(result.ok).toBe(true);
  });
});

describe('BulkSetAbsencesUseCase — write model (explicit ABSENT rows)', () => {
  it('records absences as explicit ABSENT rows and never deletes', async () => {
    const { useCase, attendanceRepo } = buildDeps({
      studentIds: ['s1', 's2', 's3'],
      currentPresentIds: ['s1', 's2', 's3'], // all currently PRESENT
    });

    const result = await useCase.execute({ ...INPUT_BASE, absentStudentIds: ['s1', 's2'] });

    expect(result.ok).toBe(true);
    // Absence is now a first-class ABSENT row — the dashboard counts ABSENT
    // rows, so a delete (old behavior) silently read as PRESENT.
    expect(attendanceRepo.deleteByAcademyStudentBatchDate).not.toHaveBeenCalled();
    const saved = attendanceRepo.save.mock.calls.map((c) => c[0]);
    const absentSaves = saved
      .filter((r) => r.status === 'ABSENT')
      .map((r) => r.studentId)
      .sort();
    expect(absentSaves).toEqual(['s1', 's2']);
  });

  it('flips a PRESENT student to ABSENT via an upserted ABSENT row (no delete)', async () => {
    const { useCase, attendanceRepo } = buildDeps({
      studentIds: ['s1', 's2'],
      currentPresentIds: ['s1', 's2'],
    });

    await useCase.execute({ ...INPUT_BASE, absentStudentIds: ['s1'] });

    const saved = attendanceRepo.save.mock.calls.map((c) => c[0]);
    const s1 = saved.find((r) => r.studentId === 's1');
    expect(s1?.status).toBe('ABSENT');
    expect(attendanceRepo.deleteByAcademyStudentBatchDate).not.toHaveBeenCalled();
  });

  it('writes PRESENT rows for the rest of the roster while marking the absentee ABSENT', async () => {
    const { useCase, attendanceRepo } = buildDeps({
      studentIds: ['s1', 's2', 's3'],
      currentPresentIds: [], // fresh roll
    });

    await useCase.execute({ ...INPUT_BASE, absentStudentIds: ['s2'] });

    const saved = attendanceRepo.save.mock.calls.map((c) => c[0]);
    const presentSaves = saved
      .filter((r) => r.status === 'PRESENT')
      .map((r) => r.studentId)
      .sort();
    const absentSaves = saved
      .filter((r) => r.status === 'ABSENT')
      .map((r) => r.studentId)
      .sort();
    expect(presentSaves).toEqual(['s1', 's3']);
    expect(absentSaves).toEqual(['s2']);
  });
});
