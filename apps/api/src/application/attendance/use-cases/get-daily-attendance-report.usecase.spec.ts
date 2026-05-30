import { GetDailyAttendanceReportUseCase } from './get-daily-attendance-report.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';

// A Tuesday firmly in the past relative to "today" (so scheduledDatesInMonth,
// which caps at today, includes it).
const DATE = '2026-04-07';

type StudentT = Awaited<ReturnType<StudentRepository['listActiveByAcademy']>>[number];
type BatchT = Awaited<ReturnType<BatchRepository['findByIds']>>[number];
type EnrollT = Awaited<ReturnType<StudentBatchRepository['findByStudentIds']>>[number];
type AbsentT = Awaited<ReturnType<StudentAttendanceRepository['findAbsentByAcademyAndDate']>>[number];

const mkStudent = (id: string, joining: string): StudentT =>
  ({ id, fullName: id, joiningDate: new Date(`${joining}T00:00:00+05:30`) }) as unknown as StudentT;
const mkBatch = (id: string, days: string[]): BatchT => ({ id, days }) as unknown as BatchT;
const mkEnroll = (studentId: string, batchId: string, assignedAt: string): EnrollT =>
  ({ studentId, batchId, assignedAt: new Date(`${assignedAt}T00:00:00+05:30`) }) as unknown as EnrollT;
const mkAbsent = (studentId: string, batchId: string): AbsentT =>
  ({ studentId, batchId }) as unknown as AbsentT;

function build(absent: AbsentT[]) {
  const userRepo = {
    findById: jest.fn().mockResolvedValue({ academyId: 'academy-1' }),
  } as unknown as jest.Mocked<UserRepository>;
  const studentRepo = {
    listActiveByAcademy: jest.fn().mockResolvedValue([
      mkStudent('anil', '2026-01-01'), // batch A (Mon/Wed/Fri) — no class on a Tuesday
      mkStudent('bina', '2026-01-01'), // batch B (Tue/Thu) — has class today
      mkStudent('charu', '2026-04-20'), // batch B, but joined AFTER the report date
    ]),
  } as unknown as jest.Mocked<StudentRepository>;
  const attendanceRepo = {
    findAbsentByAcademyAndDate: jest.fn().mockResolvedValue(absent),
  } as unknown as jest.Mocked<StudentAttendanceRepository>;
  const holidayRepo = {
    findByAcademyAndDate: jest.fn().mockResolvedValue(null),
    findByAcademyAndMonth: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<HolidayRepository>;
  const studentBatchRepo = {
    findByStudentIds: jest.fn().mockResolvedValue([
      mkEnroll('anil', 'batch-a', '2026-01-01'),
      mkEnroll('bina', 'batch-b', '2026-01-01'),
      mkEnroll('charu', 'batch-b', '2026-04-20'),
    ]),
  } as unknown as jest.Mocked<StudentBatchRepository>;
  const batchRepo = {
    findByIds: jest.fn().mockResolvedValue([
      mkBatch('batch-a', ['MON', 'WED', 'FRI']),
      mkBatch('batch-b', ['TUE', 'THU']),
    ]),
  } as unknown as jest.Mocked<BatchRepository>;

  return new GetDailyAttendanceReportUseCase(
    userRepo,
    studentRepo,
    attendanceRepo,
    holidayRepo,
    studentBatchRepo,
    batchRepo,
  );
}

describe('GetDailyAttendanceReportUseCase — default-present (absent only when explicitly marked)', () => {
  it('counts an unmarked scheduled student as present, and ignores off-weekday / not-yet-joined', async () => {
    const uc = build([]); // nobody marked absent
    const res = await uc.execute({ actorUserId: 'owner-1', actorRole: 'OWNER', date: DATE });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Only "bina" has a session today; unmarked → present (default-present),
    // matching the owner dashboard tile rather than the old "all absent".
    expect(res.value.presentCount).toBe(1);
    expect(res.value.absentCount).toBe(0);
    expect(res.value.absentStudents).toEqual([]);
  });

  it('marks the scheduled student absent only when explicitly marked ABSENT in their batch', async () => {
    const uc = build([mkAbsent('bina', 'batch-b')]);
    const res = await uc.execute({ actorUserId: 'owner-1', actorRole: 'OWNER', date: DATE });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.presentCount).toBe(0);
    expect(res.value.absentCount).toBe(1);
    expect(res.value.absentStudents.map((s) => s.studentId)).toEqual(['bina']);
  });

  it('ignores absent rows for off-weekday / not-yet-joined students (no session that day)', async () => {
    // ABSENT rows for anil (no Tuesday class) and charu (not yet joined) must
    // not surface — neither has a session on this date.
    const uc = build([mkAbsent('anil', 'batch-a'), mkAbsent('charu', 'batch-b')]);
    const res = await uc.execute({ actorUserId: 'owner-1', actorRole: 'OWNER', date: DATE });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const absentIds = res.value.absentStudents.map((s) => s.studentId);
    expect(absentIds).not.toContain('anil');
    expect(absentIds).not.toContain('charu');
    // bina unmarked → present.
    expect(res.value.presentCount).toBe(1);
    expect(res.value.absentCount).toBe(0);
  });
});
