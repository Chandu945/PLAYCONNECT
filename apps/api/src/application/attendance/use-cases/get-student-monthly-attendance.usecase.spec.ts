import { GetStudentMonthlyAttendanceUseCase } from './get-student-monthly-attendance.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';

// April 2026 fully past ⇒ batch-b (Tue/Thu) has 9 scheduled days
// (Tue 7/14/21/28 + Thu 2/9/16/23/30). See monthly-summary spec.
const MONTH = '2026-04';
const EXPECTED_DAYS = 9;

type AbsentT =
  Awaited<ReturnType<StudentAttendanceRepository['findAbsentByAcademyStudentAndMonth']>>[number];
const mkAbsent = (batchId: string, date: string): AbsentT =>
  ({ studentId: 'bina', batchId, date }) as unknown as AbsentT;

function build(absent: AbsentT[]) {
  const userRepo = {
    findById: jest.fn().mockResolvedValue({ academyId: 'academy-1' }),
  } as unknown as jest.Mocked<UserRepository>;
  const studentRepo = {
    findById: jest.fn().mockResolvedValue({
      academyId: 'academy-1',
      joiningDate: new Date('2026-01-01T00:00:00+05:30'),
      isDeleted: () => false,
    }),
  } as unknown as jest.Mocked<StudentRepository>;
  const attendanceRepo = {
    findAbsentByAcademyStudentAndMonth: jest.fn().mockResolvedValue(absent),
  } as unknown as jest.Mocked<StudentAttendanceRepository>;
  const holidayRepo = {
    findByAcademyAndMonth: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<HolidayRepository>;
  const studentBatchRepo = {
    findByStudentId: jest.fn().mockResolvedValue([
      { studentId: 'bina', batchId: 'batch-b', assignedAt: new Date('2026-01-01T00:00:00+05:30') },
    ]),
  } as unknown as jest.Mocked<StudentBatchRepository>;
  const batchRepo = {
    findByIds: jest
      .fn()
      .mockResolvedValue([{ id: 'batch-b', batchName: 'Evening', days: ['TUE', 'THU'] }]),
  } as unknown as jest.Mocked<BatchRepository>;

  return new GetStudentMonthlyAttendanceUseCase(
    userRepo,
    studentRepo,
    attendanceRepo,
    holidayRepo,
    studentBatchRepo,
    batchRepo,
  );
}

const INPUT = { actorUserId: 'owner-1', actorRole: 'OWNER' as const, studentId: 'bina', month: MONTH };

describe('GetStudentMonthlyAttendanceUseCase — default-present', () => {
  it('treats every unmarked scheduled day as present', async () => {
    const uc = build([]); // no ABSENT rows
    const res = await uc.execute(INPUT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.expectedDays).toBe(EXPECTED_DAYS);
    expect(res.value.presentDays).toBe(EXPECTED_DAYS);
    expect(res.value.absentDays).toBe(0);
    expect(res.value.absentDates).toEqual([]);
    expect(res.value.presentCount).toBe(EXPECTED_DAYS);
    expect(res.value.absentCount).toBe(0);
  });

  it('marks a day absent only when explicitly marked ABSENT in its batch', async () => {
    const uc = build([mkAbsent('batch-b', '2026-04-07')]);
    const res = await uc.execute(INPUT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.absentDays).toBe(1);
    expect(res.value.absentDates).toEqual(['2026-04-07']);
    expect(res.value.presentDays).toBe(EXPECTED_DAYS - 1);
    expect(res.value.absentCount).toBe(1);
  });
});
