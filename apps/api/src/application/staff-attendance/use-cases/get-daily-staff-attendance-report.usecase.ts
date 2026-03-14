import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StaffAttendanceRepository } from '@domain/staff-attendance/ports/staff-attendance.repository';
import { canViewStaffAttendance } from '@domain/staff-attendance/rules/staff-attendance.rules';
import { validateLocalDate } from '@domain/attendance/rules/attendance.rules';
import { StaffAttendanceErrors } from '../../common/errors';
import type { DailyStaffAttendanceReportDto } from '../dtos/staff-attendance.dto';
import type { UserRole } from '@playconnect/contracts';

export interface GetDailyStaffAttendanceReportInput {
  actorUserId: string;
  actorRole: UserRole;
  date: string;
}

export class GetDailyStaffAttendanceReportUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly staffAttendanceRepo: StaffAttendanceRepository,
  ) {}

  async execute(
    input: GetDailyStaffAttendanceReportInput,
  ): Promise<Result<DailyStaffAttendanceReportDto, AppError>> {
    const roleCheck = canViewStaffAttendance(input.actorRole);
    if (!roleCheck.allowed) {
      return err(StaffAttendanceErrors.viewNotAllowed());
    }

    const dateCheck = validateLocalDate(input.date);
    if (!dateCheck.valid) {
      return err(AppErrorClass.validation(dateCheck.reason!));
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(StaffAttendanceErrors.academyRequired());
    }

    // Staff attendance is required even on holidays — no holiday short-circuit

    // Get total ACTIVE staff count
    const { total: totalActive } = await this.userRepo.listByAcademyAndRole(
      actor.academyId,
      'STAFF',
      1,
      1,
    );

    // Get all absent records for the day
    const absentRecords = await this.staffAttendanceRepo.findAbsentByAcademyAndDate(
      actor.academyId,
      input.date,
    );

    // Batch-resolve absent staff names (avoids N+1 queries)
    const absentStaffIds = absentRecords.map((r) => r.staffUserId);
    const absentUsers = await this.userRepo.findByIds(absentStaffIds);
    const userMap = new Map(absentUsers.map((u) => [u.id.toString(), u]));
    const absentStaff = absentRecords
      .map((record) => {
        const user = userMap.get(record.staffUserId);
        return user ? { staffUserId: user.id.toString(), fullName: user.fullName } : null;
      })
      .filter((entry): entry is { staffUserId: string; fullName: string } => entry !== null);

    return ok({
      date: input.date,
      isHoliday: false,
      presentCount: totalActive - absentRecords.length,
      absentCount: absentRecords.length,
      absentStaff,
    });
  }
}
