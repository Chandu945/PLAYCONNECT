import { GetMonthlyAttendanceSummaryUseCase } from './get-monthly-attendance-summary.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';

// April 2026 is a fully-past month (relative to a later "today"), so every
// Tue/Thu in it is an expected day. April 1 2026 is a Wednesday ⇒ Tuesdays
// 7/14/21/28 (4) + Thursdays 2/9/16/23/30 (5) = 9 scheduled days for batch-b.
const MONTH = '2026-04';
const EXPECTED_DAYS = 9;

type AbsentT = Awaited<ReturnType<StudentAttendanceRepository['findAbsentByAcademyAndMonth']>>[number];
const mkAbsent = (studentId: string, batchId: string, date: string): AbsentT =>
  ({ studentId, batchId, date }) as unknown as AbsentT;

function build(absent: AbsentT[]) {
  const userRepo = {
    findById: jest.fn().mockResolvedValue({ academyId: 'academy-1' }),
  } as unknown as jest.Mocked<UserRepository>;
  const studentRepo = {
    list: jest.fn().mockResolvedValue({
      students: [{ id: 'bina', fullName: 'Bina', joiningDate: new Date('2026-01-01T00:00:00+05:30') }],
      total: 1,
    }),
  } as unknown as jest.Mocked<StudentRepository>;
  const attendanceRepo = {
    findAbsentByAcademyAndMonth: jest.fn().mockResolvedValue(absent),
  } as unknown as jest.Mocked<StudentAttendanceRepository>;
  const holidayRepo = {
    findByAcademyAndMonth: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<HolidayRepository>;
  const studentBatchRepo = {
    findByStudentIds: jest.fn().mockResolvedValue([
      { studentId: 'bina', batchId: 'batch-b', assignedAt: new Date('2026-01-01T00:00:00+05:30') },
    ]),
  } as unknown as jest.Mocked<StudentBatchRepository>;
  const batchRepo = {
    findByIds: jest.fn().mockResolvedValue([{ id: 'batch-b', days: ['TUE', 'THU'] }]),
  } as unknown as jest.Mocked<BatchRepository>;

  return new GetMonthlyAttendanceSummaryUseCase(
    userRepo,
    studentRepo,
    attendanceRepo,
    holidayRepo,
    studentBatchRepo,
    batchRepo,
  );
}

const INPUT = {
  actorUserId: 'owner-1',
  actorRole: 'OWNER' as const,
  month: MONTH,
  page: 1,
  pageSize: 50,
};

describe('GetMonthlyAttendanceSummaryUseCase — default-present', () => {
  it('counts every unmarked scheduled day as present (absent only when explicitly marked)', async () => {
    const uc = build([]); // no ABSENT rows all month
    const res = await uc.execute(INPUT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.value.data[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.presentCount).toBe(EXPECTED_DAYS);
    expect(row.absentCount).toBe(0);
  });

  it('counts an explicitly-marked ABSENT day as absent and the rest present', async () => {
    const uc = build([mkAbsent('bina', 'batch-b', '2026-04-07')]); // one Tuesday absent
    const res = await uc.execute(INPUT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = res.value.data[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.absentCount).toBe(1);
    expect(row.presentCount).toBe(EXPECTED_DAYS - 1);
  });
});
