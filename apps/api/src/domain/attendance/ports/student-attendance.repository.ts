import type { StudentAttendance } from '../entities/student-attendance.entity';

export const STUDENT_ATTENDANCE_REPOSITORY = Symbol('STUDENT_ATTENDANCE_REPOSITORY');

export interface StudentAttendanceRepository {
  save(record: StudentAttendance): Promise<void>;

  /** Mark a specific (student, batch, date) cell as ABSENT — deletes the present record. */
  deleteByAcademyStudentBatchDate(
    academyId: string,
    studentId: string,
    batchId: string,
    date: string,
  ): Promise<void>;

  /** Look up the present record for one (student, batch, date) cell. */
  findByAcademyStudentBatchDate(
    academyId: string,
    studentId: string,
    batchId: string,
    date: string,
  ): Promise<StudentAttendance | null>;

  /** All present records for a single batch on a date — drives the marking screen. */
  findPresentByAcademyBatchAndDate(
    academyId: string,
    batchId: string,
    date: string,
  ): Promise<StudentAttendance[]>;

  /** All present records for a date across every batch — academy-wide reporting. */
  findPresentByAcademyAndDate(academyId: string, date: string): Promise<StudentAttendance[]>;

  /** All ABSENT records for a date across every batch. Drives the default-present
   *  daily report: a student is absent only when explicitly marked absent in
   *  every batch they're scheduled in (mirrors the dashboard's day-level rule). */
  findAbsentByAcademyAndDate(academyId: string, date: string): Promise<StudentAttendance[]>;

  /** All present records for a student in a month, across every batch they're in. */
  findPresentByAcademyStudentAndMonth(
    academyId: string,
    studentId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]>;

  /** All ABSENT records for a student in a month — drives the default-present
   *  per-student monthly view (a day is absent only when explicitly marked). */
  findAbsentByAcademyStudentAndMonth(
    academyId: string,
    studentId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]>;

  /** All present records academy-wide in a month — KPI aggregations. */
  findPresentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]>;

  /** Cascade-delete all batches' records for a single date (used when declaring a holiday). */
  deleteByAcademyAndDate(academyId: string, date: string): Promise<void>;

  /**
   * Count session-attendances (NOT students) on a date. A two-batch student
   * present in both batches counts twice — use {@link countDistinctStudentsPresentByAcademyAndDate}
   * for "students present today" KPIs instead.
   */
  countPresentByAcademyAndDate(academyId: string, date: string): Promise<number>;

  /** DB-side distinct count of students with at least one present record on a date. */
  countDistinctStudentsPresentByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<number>;

  /**
   * Default-present model: count distinct students with at least one explicit
   * ABSENT record on a date. Mirrors the PRESENT version above.
   *
   * NOTE: superseded for the dashboard tile by
   * {@link countDistinctStudentsAbsentInAllScheduledBatchesByAcademyAndDate},
   * which matches the per-student monthly view's day-level definition. Kept
   * for callers that genuinely want "any absent record today" (raw queries,
   * audit reports).
   */
  countDistinctStudentsAbsentByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<number>;

  /**
   * Strict day-level "absent today": counts a student only if EVERY batch
   * they're scheduled in on `date` has an explicit ABSENT row. A student
   * absent in one batch but present (or unmarked → default-present) in
   * another does NOT count. Mirrors get-student-monthly-attendance's
   * presentBatches.size === 0 branch so the dashboard tile and the
   * per-student monthly view agree on what "absent for the day" means.
   */
  countDistinctStudentsAbsentInAllScheduledBatchesByAcademyAndDate(
    academyId: string,
    date: string,
  ): Promise<number>;

  /**
   * All ABSENT records academy-wide in a month. Mirrors
   * `findPresentByAcademyAndMonth` so the monthly summary can compute the
   * per-day Present = scheduled_that_day − distinct_absent_that_day under
   * the default-present model.
   */
  findAbsentByAcademyAndMonth(
    academyId: string,
    monthPrefix: string,
  ): Promise<StudentAttendance[]>;

  /** Cascade-delete all attendance records for a student. Returns count removed. */
  deleteAllByAcademyAndStudent(academyId: string, studentId: string): Promise<number>;
}
