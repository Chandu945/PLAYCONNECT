import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import { canViewAttendance } from '@domain/attendance/rules/attendance.rules';
import { isValidMonthKey, getTodayLocalDate } from '@domain/attendance/value-objects/local-date.vo';
import { scheduledDatesInMonth } from '@domain/attendance/value-objects/batch-schedule.vo';

/** Format a JS Date as YYYY-MM-DD in IST (Asia/Kolkata) for comparison
 *  against scheduled-date keys. */
function toLocalDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
import { AttendanceErrors } from '../../common/errors';
import type { MonthlyAttendanceSummaryItem } from '../dtos/attendance.dto';
import type { UserRole } from '@academyflo/contracts';

export interface GetMonthlyAttendanceSummaryInput {
  actorUserId: string;
  actorRole: UserRole;
  month: string;
  page: number;
  pageSize: number;
  search?: string;
}

export interface GetMonthlyAttendanceSummaryOutput {
  data: MonthlyAttendanceSummaryItem[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class GetMonthlyAttendanceSummaryUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly attendanceRepo: StudentAttendanceRepository,
    private readonly holidayRepo: HolidayRepository,
    private readonly studentBatchRepo: StudentBatchRepository,
    private readonly batchRepo: BatchRepository,
  ) {}

  async execute(
    input: GetMonthlyAttendanceSummaryInput,
  ): Promise<Result<GetMonthlyAttendanceSummaryOutput, AppError>> {
    const roleCheck = canViewAttendance(input.actorRole);
    if (!roleCheck.allowed) {
      return err(AttendanceErrors.viewNotAllowed());
    }

    if (!isValidMonthKey(input.month)) {
      return err(AppErrorClass.validation('Month must be a valid YYYY-MM format'));
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(AttendanceErrors.academyRequired());
    }

    const { students, total } = await this.studentRepo.list(
      { academyId: actor.academyId, status: 'ACTIVE', search: input.search },
      input.page,
      input.pageSize,
    );
    const studentIds = students.map((s) => s.id.toString());

    const [allAbsent, holidays] = await Promise.all([
      this.attendanceRepo.findAbsentByAcademyAndMonth(actor.academyId, input.month),
      this.holidayRepo.findByAcademyAndMonth(actor.academyId, input.month),
    ]);

    const holidayDates = holidays.map((h) => h.date);
    // Cap "elapsed" date and holiday count to today (IST). Past months: today
    // > monthEnd, so the cap is a no-op. Current month: only past + today
    // count as expected days. Future months: nothing is expected.
    const today = getTodayLocalDate();
    const monthStart = `${input.month}-01`;
    const holidayCount = holidayDates.filter((d) => d <= today).length;

    // M1 fix (attendance audit): per-page enrollments fetched in ONE query
    // via `findByStudentIds` instead of N separate `findByStudentId` calls.
    // Prior code did `Promise.all` over `studentIds.map(findByStudentId)` —
    // for pageSize=50 that was 50 round-trips per request. The new batched
    // `$in` query is one trip; we just bucket the results by studentId.
    const enrollmentsByStudent = new Map<string, { batchId: string; assignedAt: Date }[]>();
    for (const sid of studentIds) {
      enrollmentsByStudent.set(sid, []);
    }
    const allBatchIds = new Set<string>();
    const allEnrollments = await this.studentBatchRepo.findByStudentIds(studentIds);
    for (const enrol of allEnrollments) {
      const bucket = enrollmentsByStudent.get(enrol.studentId);
      if (bucket) {
        bucket.push({ batchId: enrol.batchId, assignedAt: enrol.assignedAt });
      }
      allBatchIds.add(enrol.batchId);
    }
    const batches = allBatchIds.size > 0 ? await this.batchRepo.findByIds([...allBatchIds]) : [];

    // Cache scheduled DATES per batch (excluding holidays and future days).
    // We then filter per-student against their joining date and per-batch
    // assignment date to avoid charging absences for time before they joined.
    const expectedDatesByBatch = new Map<string, string[]>();
    for (const batch of batches) {
      expectedDatesByBatch.set(
        batch.id.toString(),
        scheduledDatesInMonth(input.month, batch.days, holidayDates, today),
      );
    }

    // Default-present model: ABSENT rows per (student, date, batch). A day
    // counts as absent only when the student is explicitly marked ABSENT in
    // EVERY batch scheduled that day; an unmarked or partially-present day
    // stays present (the inverse of the old "lax present" rule, and the same
    // rule the daily report and dashboard tile use).
    const absentBatchesByStudentDate = new Map<string, Map<string, Set<string>>>();
    for (const record of allAbsent) {
      let byDate = absentBatchesByStudentDate.get(record.studentId);
      if (!byDate) {
        byDate = new Map();
        absentBatchesByStudentDate.set(record.studentId, byDate);
      }
      let set = byDate.get(record.date);
      if (!set) {
        set = new Set();
        byDate.set(record.date, set);
      }
      set.add(record.batchId);
    }

    const data: MonthlyAttendanceSummaryItem[] = students.map((s) => {
      const sid = s.id.toString();
      const studentJoinKey = toLocalDateKey(s.joiningDate);
      const studentStart = studentJoinKey > monthStart ? studentJoinKey : monthStart;

      // Scheduled batches per expected date for this student (after applying
      // joining / batch-assignment effective starts).
      const enrollments = enrollmentsByStudent.get(sid) ?? [];
      const scheduledBatchesByDate = new Map<string, Set<string>>();
      for (const enrol of enrollments) {
        const dates = expectedDatesByBatch.get(enrol.batchId);
        if (!dates) continue;
        const enrolKey = toLocalDateKey(enrol.assignedAt);
        const effectiveStart = enrolKey > studentStart ? enrolKey : studentStart;
        for (const d of dates) {
          if (d < effectiveStart) continue;
          let set = scheduledBatchesByDate.get(d);
          if (!set) {
            set = new Set();
            scheduledBatchesByDate.set(d, set);
          }
          set.add(enrol.batchId);
        }
      }

      const absentDateBatches = absentBatchesByStudentDate.get(sid);
      let presentCount = 0;
      let absentCount = 0;
      for (const [d, scheduledBatches] of scheduledBatchesByDate) {
        const absentBatches = absentDateBatches?.get(d);
        const absentInAllScheduled =
          absentBatches !== undefined &&
          [...scheduledBatches].every((batchId) => absentBatches.has(batchId));
        if (absentInAllScheduled) absentCount++;
        else presentCount++;
      }
      return {
        studentId: sid,
        fullName: s.fullName,
        presentCount,
        absentCount,
        holidayCount,
      };
    });

    return ok({
      data,
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    });
  }
}
