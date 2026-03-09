import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { canViewAttendance } from '@domain/attendance/rules/attendance.rules';
import { isValidMonthKey, getDaysInMonth } from '@domain/attendance/value-objects/local-date.vo';
import { AttendanceErrors } from '../../common/errors';
import type { StudentMonthlyAttendanceDto } from '../dtos/attendance.dto';
import type { UserRole } from '@playconnect/contracts';

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

    const [absentRecords, holidays] = await Promise.all([
      this.attendanceRepo.findAbsentByAcademyStudentAndMonth(
        actor.academyId,
        input.studentId,
        input.month,
      ),
      this.holidayRepo.findByAcademyAndMonth(actor.academyId, input.month),
    ]);

    const absentDates = absentRecords.map((r) => r.date);
    const holidayDates = holidays.map((h) => h.date);
    const holidayDateSet = new Set(holidayDates);
    const daysInMonth = getDaysInMonth(input.month);
    const absentCount = absentDates.length;
    const holidayCount = holidayDates.length;
    const overlapCount = absentDates.filter((d) => holidayDateSet.has(d)).length;
    const presentCount = daysInMonth - absentCount - holidayCount + overlapCount;

    return ok({
      studentId: input.studentId,
      month: input.month,
      absentDates,
      holidayDates,
      presentCount: Math.max(0, presentCount),
      absentCount,
      holidayCount,
    });
  }
}
