import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import { canViewAttendance } from '@domain/attendance/rules/attendance.rules';
import { isValidMonthKey, getTodayLocalDate } from '@domain/attendance/value-objects/local-date.vo';
import { scheduledDatesInMonth } from '@domain/attendance/value-objects/batch-schedule.vo';

function toLocalDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
import { AttendanceErrors } from '../../common/errors';
import type {
  StudentMonthlyAttendanceDto,
  StudentBatchAttendanceBreakdown,
} from '../dtos/attendance.dto';
import type { UserRole } from '@academyflo/contracts';

export interface GetStudentMonthlyAttendanceInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  month: string;
}

export class GetStudentMonthlyAttendanceUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly attendanceRepo: StudentAttendanceRepository,
    private readonly holidayRepo: HolidayRepository,
    private readonly studentBatchRepo: StudentBatchRepository,
    private readonly batchRepo: BatchRepository,
  ) {}

  async execute(
    input: GetStudentMonthlyAttendanceInput,
  ): Promise<Result<StudentMonthlyAttendanceDto, AppError>> {
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

    // Allow historical lookup for any student (even INACTIVE/LEFT)
    const student = await this.studentRepo.findById(input.studentId);
    if (!student || student.isDeleted()) {
      return err(AttendanceErrors.studentNotFound(input.studentId));
    }

    if (student.academyId !== actor.academyId) {
      return err(AttendanceErrors.studentNotInAcademy());
    }

    const [absentRecords, holidays, enrollments] = await Promise.all([
      this.attendanceRepo.findAbsentByAcademyStudentAndMonth(
        actor.academyId,
        input.studentId,
        input.month,
      ),
      this.holidayRepo.findByAcademyAndMonth(actor.academyId, input.month),
      this.studentBatchRepo.findByStudentId(input.studentId),
    ]);

    const holidayDates = holidays.map((h) => h.date);
    const studentBatchIds = enrollments.map((e) => e.batchId);
    const batches =
      studentBatchIds.length > 0 ? await this.batchRepo.findByIds(studentBatchIds) : [];

    // Group ABSENT records by batch for the per-batch breakdown. Default-
    // present: a scheduled date is absent only when explicitly marked ABSENT;
    // every other scheduled date (unmarked or present) counts as present.
    const absentByBatch = new Map<string, Set<string>>();
    for (const record of absentRecords) {
      let set = absentByBatch.get(record.batchId);
      if (!set) {
        set = new Set<string>();
        absentByBatch.set(record.batchId, set);
      }
      set.add(record.date);
    }

    const today = getTodayLocalDate();
    const monthStart = `${input.month}-01`;
    const studentJoinKey = toLocalDateKey(student.joiningDate);
    const studentEffectiveStart = studentJoinKey > monthStart ? studentJoinKey : monthStart;
    const enrolStartByBatch = new Map<string, string>();
    for (const enrol of enrollments) {
      const enrolKey = toLocalDateKey(enrol.assignedAt);
      enrolStartByBatch.set(
        enrol.batchId,
        enrolKey > studentEffectiveStart ? enrolKey : studentEffectiveStart,
      );
    }

    // Per-batch breakdown stays session-level: each batch's scheduled dates,
    // capped to that enrollment's effective start date.
    let totalExpected = 0;
    let totalPresent = 0;
    const expectedBatchesByDate = new Map<string, Set<string>>();
    const absentBatchesByDate = new Map<string, Set<string>>();
    const perBatch: StudentBatchAttendanceBreakdown[] = batches.map((batch) => {
      const batchId = batch.id.toString();
      const enrolStart = enrolStartByBatch.get(batchId) ?? studentEffectiveStart;
      const expectedDates = scheduledDatesInMonth(
        input.month,
        batch.days,
        holidayDates,
        today,
      ).filter((d) => d >= enrolStart);
      const absentSet = absentByBatch.get(batchId) ?? new Set<string>();
      const absentDates = expectedDates.filter((d) => absentSet.has(d));
      const presentDates = expectedDates.filter((d) => !absentSet.has(d));
      for (const d of expectedDates) {
        let set = expectedBatchesByDate.get(d);
        if (!set) {
          set = new Set();
          expectedBatchesByDate.set(d, set);
        }
        set.add(batchId);
      }
      for (const d of absentDates) {
        let set = absentBatchesByDate.get(d);
        if (!set) {
          set = new Set();
          absentBatchesByDate.set(d, set);
        }
        set.add(batchId);
      }
      totalExpected += expectedDates.length;
      totalPresent += presentDates.length;
      return {
        batchId,
        batchName: batch.batchName,
        expectedCount: expectedDates.length,
        presentCount: presentDates.length,
        presentDates,
        absentDates,
      };
    });

    // Day-level aggregates — the user-facing "how is this student doing".
    // Default-present: a day is absent only when the student is marked ABSENT
    // in EVERY batch scheduled that day. A day with at least one non-absent
    // (unmarked or present) batch counts as present; if some — but not all —
    // of the day's batches are absent, it's a partial day.
    let presentDays = 0;
    let absentDays = 0;
    let partialDays = 0;
    const dayAbsentDates: string[] = [];
    for (const [date, expectedBatches] of expectedBatchesByDate) {
      const absentBatches = absentBatchesByDate.get(date);
      const absentInAll =
        absentBatches !== undefined && absentBatches.size >= expectedBatches.size;
      if (absentInAll) {
        absentDays++;
        dayAbsentDates.push(date);
      } else {
        presentDays++;
        if (absentBatches !== undefined && absentBatches.size > 0) partialDays++;
      }
    }
    const expectedDays = expectedBatchesByDate.size;

    return ok({
      studentId: input.studentId,
      month: input.month,
      absentDates: dayAbsentDates.sort(),
      holidayDates,
      // Session-level (kept for backward compat / per-batch math).
      presentCount: totalPresent,
      absentCount: Math.max(0, totalExpected - totalPresent),
      expectedCount: totalExpected,
      holidayCount: holidayDates.length,
      // Day-level (the new actionable metrics).
      expectedDays,
      presentDays,
      absentDays,
      partialDays,
      perBatch,
    });
  }
}
