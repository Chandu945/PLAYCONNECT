import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import {
  canMarkAttendance,
  validateLocalDate,
  validateDateRange,
} from '@domain/attendance/rules/attendance.rules';
import { AttendanceErrors } from '../../common/errors';
import type { UserRole } from '@academyflo/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { AbsenceNotificationSchedulerPort } from '../../notifications/ports/absence-notification-scheduler.port';
import type { TransactionPort } from '../../common/transaction.port';
import { formatLocalDate } from '@shared/date-utils';
import { randomUUID } from 'crypto';

export interface BulkSetAbsencesInput {
  actorUserId: string;
  actorRole: UserRole;
  batchId: string;
  date: string;
  /** Students in the batch who were ABSENT. Everyone else in the batch is PRESENT. */
  absentStudentIds: string[];
}

export interface BulkSetAbsencesOutput {
  batchId: string;
  date: string;
  absentCount: number;
}

/**
 * KNOWN LIMITATION (L7 attendance audit — accepted as wontfix):
 *
 * `currentPresent` is read BEFORE the transaction starts. The diff-vs-write
 * cycle is therefore vulnerable to a race with a concurrent single-tap
 * mark-student-attendance on the same batch+date:
 *
 *   1. Bulk-set reads currentPresent (no transaction session).
 *   2. While bulk-set computes its diff, a single-tap commit lands —
 *      say it marks student D as PRESENT.
 *   3. Bulk-set's diff doesn't know about D. Two failure modes:
 *      a. If bulk-set's input has D in `shouldBePresentIds`, the insert
 *         attempt hits the unique index `(academyId, studentId, batchId,
 *         date)` and Mongo throws 11000 — the whole transaction aborts.
 *      b. If bulk-set's input has D in `absentStudentIds`, the delete
 *         loop iterates `currentPresent` (which doesn't include D) and
 *         skips deleting D's record — D stays PRESENT contrary to
 *         bulk-set's intent.
 *
 * Why this is left in place:
 *   - Requires two coaches editing the same batch+date within
 *     milliseconds. Single-owner academies never hit it; multi-coach
 *     academies coordinating in person rarely hit it.
 *   - Failure mode (a) returns 500 to one coach who can refresh and
 *     re-submit. Failure mode (b) is a silent inconsistency that's
 *     correctable by re-running bulk-set or manually re-marking.
 *   - No data loss in either case.
 *
 * Proper fix if this becomes a real support burden:
 *   - Replace the per-record delete loop with `deleteMany({academyId,
 *     batchId, date, studentId: {$nin: shouldBePresentIds}})` — atomic
 *     and race-free, no dependency on a pre-loaded snapshot.
 *   - Wrap inserts in 11000-idempotent catch (M1-style pattern).
 *   - Requires a new repo method like `deleteByBatchAndDateExceptStudents`.
 */
export class BulkSetAbsencesUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly attendanceRepo: StudentAttendanceRepository,
    private readonly holidayRepo: HolidayRepository,
    private readonly batchRepo: BatchRepository,
    private readonly studentBatchRepo: StudentBatchRepository,
    private readonly auditRecorder: AuditRecorderPort,
    /**
     * Required (L3 fix). Previously optional with a fallback that ran the
     * diff-write loop unwrapped — a mid-flight failure on the 3rd delete
     * after 2 succeeded would leave partial state. Production has always
     * wired the transaction; the optional fallback only ever exercised an
     * unrealistic code path from test fixtures that forgot to pass it.
     */
    private readonly transaction: TransactionPort,
    /**
     * Optional for the same reason MarkStudentAttendance's is — keeps legacy
     * fixtures working. Production wiring always passes one.
     */
    private readonly absenceScheduler?: AbsenceNotificationSchedulerPort,
  ) {}

  async execute(input: BulkSetAbsencesInput): Promise<Result<BulkSetAbsencesOutput, AppError>> {
    const roleCheck = canMarkAttendance(input.actorRole);
    if (!roleCheck.allowed) {
      return err(AttendanceErrors.markNotAllowed());
    }

    const dateCheck = validateLocalDate(input.date);
    if (!dateCheck.valid) {
      return err(AppErrorClass.validation(dateCheck.reason!));
    }

    const dateRangeCheck = validateDateRange(input.date);
    if (!dateRangeCheck.valid) {
      return err(AppErrorClass.validation(dateRangeCheck.reason!));
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(AttendanceErrors.academyRequired());
    }
    const academyId: string = actor.academyId;

    const batch = await this.batchRepo.findById(input.batchId);
    if (!batch) {
      return err(AttendanceErrors.batchNotFound(input.batchId));
    }
    if (batch.academyId !== academyId) {
      return err(AttendanceErrors.batchNotInAcademy());
    }

    // Check holiday
    const holiday = await this.holidayRepo.findByAcademyAndDate(academyId, input.date);
    if (holiday) {
      return err(AttendanceErrors.holidayDeclared());
    }

    // Validate every input student is enrolled in this batch (catches typos and
    // prevents marking absences for someone outside the batch's roster).
    const uniqueAbsent = [...new Set(input.absentStudentIds)];
    const enrollments = await this.studentBatchRepo.findByBatchId(input.batchId);
    const rosterIds = new Set(enrollments.map((e) => e.studentId));
    // BUG-032: enrollment-date map for the per-batch start cutoff. Keyed by
    // studentId so we can both (a) reject explicit absences for students
    // who weren't yet enrolled on the target date and (b) filter the
    // auto-fill PRESENT roster to mirror the monthly-summary logic.
    const enrolledOnByStudent = new Map<string, string>();
    for (const e of enrollments) {
      enrolledOnByStudent.set(e.studentId, formatLocalDate(e.assignedAt));
    }
    for (const sid of uniqueAbsent) {
      if (!rosterIds.has(sid)) {
        return err(AttendanceErrors.studentNotInBatch());
      }
      const enrolledOn = enrolledOnByStudent.get(sid)!;
      if (input.date < enrolledOn) {
        return err(AttendanceErrors.dateBeforeEnrollment(enrolledOn));
      }
    }

    // Confirm the absent students still exist + are active in the academy.
    const students = await this.studentRepo.findByIds(uniqueAbsent);
    const studentMap = new Map(students.map((s) => [s.id.toString(), s]));
    for (const studentId of uniqueAbsent) {
      const student = studentMap.get(studentId);
      if (!student || student.isDeleted()) {
        return err(AttendanceErrors.studentNotFound(studentId));
      }
      if (student.academyId !== academyId) {
        return err(AttendanceErrors.studentNotInAcademy());
      }
      // H2 fix (attendance audit): allow attendance edits for INACTIVE/LEFT
      // students if the target date predates their status change. See the
      // matching block in mark-student-attendance.usecase.ts for context.
      if (student.status !== 'ACTIVE') {
        const statusChangedAt = student.statusChangedAt;
        const wasActiveOnDate =
          statusChangedAt !== null && input.date < formatLocalDate(statusChangedAt);
        if (!wasActiveOnDate) {
          return err(AttendanceErrors.studentNotActive(studentId));
        }
      }
    }

    // Students in the batch who were ACTIVE *on the target date* should be
    // PRESENT; everyone else has no record. H2 fix: same backfill-friendly
    // logic as the per-student check above — a student who departed AFTER
    // the target date still counts as on-roster for that date. Without
    // this, bulk-set on a historical date drops departed students from
    // `shouldBePresentIds` and silently deletes their valid PRESENT records.
    const allRosterStudents = await this.studentRepo.findByIds([...rosterIds]);
    const activeRosterIds = allRosterStudents
      .filter((s) => {
        if (s.isDeleted()) return false;
        // BUG-026: must mirror the read-side joining-date filter in
        // get-daily-attendance-view.usecase.ts. Without this, the auto-fill
        // inserts PRESENT rows for students whose joiningDate is after the
        // target date — the UI then hides them via the read filter but the
        // orphan rows pollute reports and bulk-set diffs forever.
        if (s.joiningDate && formatLocalDate(s.joiningDate) > input.date) return false;
        // BUG-032: also drop students whose per-batch enrollment is later
        // than the target date. The monthly summary keys "expected days"
        // off `assignedAt`, so a PRESENT row inserted earlier than that
        // would never be counted — an orphan write.
        const enrolledOn = enrolledOnByStudent.get(s.id.toString());
        if (enrolledOn && input.date < enrolledOn) return false;
        if (s.status === 'ACTIVE') return true;
        const statusChangedAt = s.statusChangedAt;
        return statusChangedAt !== null && input.date < formatLocalDate(statusChangedAt);
      })
      .map((s) => s.id.toString());
    const absentSet = new Set(uniqueAbsent);
    const shouldBePresentIds = activeRosterIds.filter((id) => !absentSet.has(id));

    // Records currently saved for this batch on this date.
    const currentPresent = await this.attendanceRepo.findPresentByAcademyBatchAndDate(
      academyId,
      input.batchId,
      input.date,
    );
    const currentPresentSet = new Set(currentPresent.map((r) => r.studentId));

    // Wrap the writes in a transaction so a mid-flight failure doesn't leave
    // the batch in a partial state.
    let didChange = false;
    const bulkOps = async () => {
      // Mark explicit absences. Previously this DELETED the present row, which
      // left "no row" for an absent student — indistinguishable from a
      // never-marked student and silently counted as PRESENT by the owner
      // dashboard (which keys "absent" off explicit ABSENT rows). Writing an
      // explicit ABSENT row makes absence a first-class signal every read path
      // can trust. The save() upsert flips any existing PRESENT row on the
      // same (academy, student, batch, date) to ABSENT without duplicates.
      for (const studentId of uniqueAbsent) {
        const record = StudentAttendance.create({
          id: randomUUID(),
          academyId,
          studentId,
          batchId: input.batchId,
          date: input.date,
          markedByUserId: input.actorUserId,
          status: 'ABSENT',
        });
        await this.attendanceRepo.save(record);
        didChange = true;
      }

      // Insert/refresh PRESENT rows for students who should be present. The
      // upsert flips any stale ABSENT row (a PRESENT → ABSENT → PRESENT toggle)
      // back to PRESENT without creating a duplicate.
      for (const studentId of shouldBePresentIds) {
        if (!currentPresentSet.has(studentId)) {
          const record = StudentAttendance.create({
            id: randomUUID(),
            academyId,
            studentId,
            batchId: input.batchId,
            date: input.date,
            markedByUserId: input.actorUserId,
          });
          await this.attendanceRepo.save(record);
          didChange = true;
        }
      }
    };

    await this.transaction.run(bulkOps);

    // BUG-025: only audit when the call actually mutated state OR the caller
    // declared at least one explicit absence. Without this guard, the mobile
    // first-view auto-fill on an empty batch wrote an audit entry without
    // touching any data, which permanently flipped `rollOpened` to true and
    // caused students added later to default to ABSENT instead of PRESENT.
    if (didChange || uniqueAbsent.length > 0) {
      await this.auditRecorder.record({
        academyId,
        actorUserId: input.actorUserId,
        action: 'STUDENT_ATTENDANCE_EDITED',
        entityType: 'STUDENT_ATTENDANCE',
        entityId: input.batchId,
        context: {
          batchId: input.batchId,
          date: input.date,
          absentCount: String(uniqueAbsent.length),
        },
      });
    }

    // Compute scheduler work for parity with the per-tap path:
    //   Schedule a push for every student in the absent list. The per-tap
    //   mark-student-attendance always schedules on ABSENT regardless of
    //   prior state — bulk-set must do the same so a coach hitting "Mark
    //   All Absent" gets the same parent push behavior as tapping each kid
    //   one by one. BullMQ jobId dedup makes re-scheduling already-pending
    //   absences a cheap no-op.
    //
    //   Cancel a push for every student transitioning ABSENT → PRESENT
    //   (had no PRESENT row before, has one now). Cancel is also called
    //   for students who never had a pending notification (cheap Redis
    //   no-op via getJob), but only for the diff set — not the full
    //   roster — to keep the round-trip count bounded.
    //
    // Auto-fill fast-path: when the request marks no one absent AND there
    // were no PRESENT rows before, nothing transitions and nothing was
    // ever scheduled for these students. Skip the work entirely to avoid
    // N redundant Redis lookups per fresh-roll-view.
    const isFreshRollAutoFill = uniqueAbsent.length === 0 && currentPresent.length === 0;
    if (this.absenceScheduler && !isFreshRollAutoFill) {
      const newlyPresentIds: string[] = [];
      for (const studentId of shouldBePresentIds) {
        if (!currentPresentSet.has(studentId)) {
          newlyPresentIds.push(studentId);
        }
      }
      // allSettled (not all): a single scheduler failure must not abandon
      // the rest of the work. Each call already throws on its own
      // infrastructure errors and is logged inside the scheduler — we just
      // make sure all of them get attempted.
      await Promise.allSettled([
        ...uniqueAbsent.map((studentId) =>
          this.absenceScheduler!.schedule({
            academyId,
            studentId,
            batchId: input.batchId,
            date: input.date,
          }),
        ),
        ...newlyPresentIds.map((studentId) =>
          this.absenceScheduler!.cancel({
            academyId,
            studentId,
            batchId: input.batchId,
            date: input.date,
          }),
        ),
      ]);
    }

    return ok({
      batchId: input.batchId,
      date: input.date,
      absentCount: uniqueAbsent.length,
    });
  }
}
