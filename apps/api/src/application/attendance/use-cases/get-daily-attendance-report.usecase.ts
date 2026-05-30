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
import { canViewAttendance, validateLocalDate } from '@domain/attendance/rules/attendance.rules';
import { getTodayLocalDate } from '@domain/attendance/value-objects/local-date.vo';
import { scheduledDatesInMonth } from '@domain/attendance/value-objects/batch-schedule.vo';
import { AttendanceErrors } from '../../common/errors';
import type { DailyAttendanceReportDto } from '../dtos/attendance.dto';
import type { UserRole } from '@academyflo/contracts';

/** Format a JS Date as YYYY-MM-DD in IST (Asia/Kolkata) for comparison against
 *  scheduled-date keys. Mirrors get-monthly-attendance-summary.usecase.ts. */
function toLocalDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export interface GetDailyAttendanceReportInput {
  actorUserId: string;
  actorRole: UserRole;
  date: string;
}

export class GetDailyAttendanceReportUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly attendanceRepo: StudentAttendanceRepository,
    private readonly holidayRepo: HolidayRepository,
    private readonly studentBatchRepo: StudentBatchRepository,
    private readonly batchRepo: BatchRepository,
  ) {}

  async execute(
    input: GetDailyAttendanceReportInput,
  ): Promise<Result<DailyAttendanceReportDto, AppError>> {
    const roleCheck = canViewAttendance(input.actorRole);
    if (!roleCheck.allowed) {
      return err(AttendanceErrors.viewNotAllowed());
    }

    const dateCheck = validateLocalDate(input.date);
    if (!dateCheck.valid) {
      return err(AppErrorClass.validation(dateCheck.reason!));
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(AttendanceErrors.academyRequired());
    }

    const holiday = await this.holidayRepo.findByAcademyAndDate(actor.academyId, input.date);
    const isHoliday = holiday !== null;

    if (isHoliday) {
      return ok({
        date: input.date,
        isHoliday: true,
        presentCount: 0,
        absentCount: 0,
        absentStudents: [],
      });
    }

    // Only students who actually have a session on this date count toward the
    // report. "Expected today" = active students enrolled in a batch that meets
    // this weekday (holidays already short-circuited above), whose effective
    // start (joining date / batch-assignment date) is on or before the date.
    // This mirrors get-monthly-attendance-summary so the two screens agree —
    // previously this used "all active students − present", which wrongly
    // marked off-weekday, not-yet-joined, and not-yet-marked students absent.
    const allActiveStudents = await this.studentRepo.listActiveByAcademy(actor.academyId);
    const studentIds = allActiveStudents.map((s) => s.id.toString());
    const month = input.date.slice(0, 7);

    const [absentRecords, holidaysThisMonth, allEnrollments] = await Promise.all([
      this.attendanceRepo.findAbsentByAcademyAndDate(actor.academyId, input.date),
      this.holidayRepo.findByAcademyAndMonth(actor.academyId, month),
      studentIds.length > 0
        ? this.studentBatchRepo.findByStudentIds(studentIds)
        : Promise.resolve([]),
    ]);

    // Default-present model: a student is absent only when explicitly marked
    // ABSENT in EVERY batch they're scheduled in today (matching the dashboard
    // tile's day-level rule). Collect the batches each student has an ABSENT
    // row for; an unmarked or partially-present student stays present.
    const absentBatchesByStudent = new Map<string, Set<string>>();
    for (const r of absentRecords) {
      const set = absentBatchesByStudent.get(r.studentId);
      if (set) set.add(r.batchId);
      else absentBatchesByStudent.set(r.studentId, new Set([r.batchId]));
    }

    // Bucket enrollments by student and collect the batches involved.
    const enrollmentsByStudent = new Map<string, { batchId: string; assignedAt: Date }[]>();
    const allBatchIds = new Set<string>();
    for (const e of allEnrollments) {
      const bucket = enrollmentsByStudent.get(e.studentId);
      if (bucket) bucket.push({ batchId: e.batchId, assignedAt: e.assignedAt });
      else enrollmentsByStudent.set(e.studentId, [{ batchId: e.batchId, assignedAt: e.assignedAt }]);
      allBatchIds.add(e.batchId);
    }

    const batches = allBatchIds.size > 0 ? await this.batchRepo.findByIds([...allBatchIds]) : [];
    const holidayDates = holidaysThisMonth.map((h) => h.date);
    const today = getTodayLocalDate();

    // Batches whose schedule includes the report date. scheduledDatesInMonth
    // already excludes holidays and future days, matching the monthly summary.
    const batchesMeetingToday = new Set<string>();
    for (const batch of batches) {
      const dates = scheduledDatesInMonth(month, batch.days, holidayDates, today);
      if (dates.includes(input.date)) batchesMeetingToday.add(batch.id.toString());
    }

    // Walk expected students. "Scheduled today" batches = batches meeting this
    // weekday whose effective start (max of joining / batch-assignment date) is
    // on or before the date. A student is ABSENT only if every one of those
    // batches has an ABSENT row; otherwise (unmarked, present, or partial) they
    // count as present. Students with no session today are neither.
    let presentCount = 0;
    const absentStudents: { studentId: string; fullName: string }[] = [];
    for (const s of allActiveStudents) {
      const sid = s.id.toString();
      const joinKey = toLocalDateKey(s.joiningDate);
      const enrollments = enrollmentsByStudent.get(sid) ?? [];
      const scheduledTodayBatches = enrollments
        .filter((e) => {
          if (!batchesMeetingToday.has(e.batchId)) return false;
          const enrolKey = toLocalDateKey(e.assignedAt);
          const effectiveStart = enrolKey > joinKey ? enrolKey : joinKey;
          return effectiveStart <= input.date;
        })
        .map((e) => e.batchId);
      if (scheduledTodayBatches.length === 0) continue;
      const absentBatches = absentBatchesByStudent.get(sid);
      const absentInAllScheduled =
        absentBatches !== undefined &&
        scheduledTodayBatches.every((batchId) => absentBatches.has(batchId));
      if (absentInAllScheduled) absentStudents.push({ studentId: sid, fullName: s.fullName });
      else presentCount++;
    }

    return ok({
      date: input.date,
      isHoliday: false,
      presentCount,
      absentCount: absentStudents.length,
      absentStudents,
    });
  }
}
