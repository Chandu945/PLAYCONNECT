import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import { StaffAttendance } from '@domain/staff-attendance/entities/staff-attendance.entity';
import type { StaffAttendanceRepository } from '@domain/staff-attendance/ports/staff-attendance.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { canMarkStaffAttendance } from '@domain/staff-attendance/rules/staff-attendance.rules';
import {
  validateLocalDate,
  validateAttendanceStatus,
  validateDateRange,
} from '@domain/attendance/rules/attendance.rules';
import { StaffAttendanceErrors } from '../../common/errors';
import type { StaffAttendanceViewStatus, UserRole } from '@playconnect/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import { randomUUID } from 'crypto';

export interface MarkStaffAttendanceInput {
  actorUserId: string;
  actorRole: UserRole;
  staffUserId: string;
  date: string;
  status: string;
}

export interface MarkStaffAttendanceOutput {
  staffUserId: string;
  date: string;
  status: StaffAttendanceViewStatus;
}

export class MarkStaffAttendanceUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly staffAttendanceRepo: StaffAttendanceRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(
    input: MarkStaffAttendanceInput,
  ): Promise<Result<MarkStaffAttendanceOutput, AppError>> {
    const roleCheck = canMarkStaffAttendance(input.actorRole);
    if (!roleCheck.allowed) {
      return err(StaffAttendanceErrors.markNotAllowed());
    }

    const dateCheck = validateLocalDate(input.date);
    if (!dateCheck.valid) {
      return err(AppErrorClass.validation(dateCheck.reason!));
    }

    const dateRangeCheck = validateDateRange(input.date);
    if (!dateRangeCheck.valid) {
      return err(AppErrorClass.validation(dateRangeCheck.reason!));
    }

    const statusCheck = validateAttendanceStatus(input.status);
    if (!statusCheck.valid) {
      return err(AppErrorClass.validation(statusCheck.reason!));
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(StaffAttendanceErrors.academyRequired());
    }

    const staffUser = await this.userRepo.findById(input.staffUserId);
    if (!staffUser || staffUser.role !== 'STAFF') {
      return err(StaffAttendanceErrors.staffNotFound(input.staffUserId));
    }

    if (staffUser.academyId !== actor.academyId) {
      return err(StaffAttendanceErrors.staffNotInAcademy());
    }

    if (!staffUser.isActive()) {
      return err(StaffAttendanceErrors.staffNotActive());
    }

    // No holiday check — staff attendance is required even on holidays

    if (input.status === 'ABSENT') {
      // Check if an absent record already exists to avoid overwriting audit data
      const existing = await this.staffAttendanceRepo.findAbsentByAcademyDateAndStaffIds(
        actor.academyId,
        input.date,
        [input.staffUserId],
      );
      if (existing.length === 0) {
        const record = StaffAttendance.create({
          id: randomUUID(),
          academyId: actor.academyId,
          staffUserId: input.staffUserId,
          date: input.date,
          markedByUserId: input.actorUserId,
        });
        await this.staffAttendanceRepo.save(record);
      }
    } else {
      // PRESENT: delete absent record if exists (idempotent)
      await this.staffAttendanceRepo.deleteByAcademyStaffDate(
        actor.academyId,
        input.staffUserId,
        input.date,
      );
    }

    await this.auditRecorder.record({
      academyId: actor.academyId,
      actorUserId: input.actorUserId,
      action: 'STAFF_ATTENDANCE_CHANGED',
      entityType: 'STAFF_ATTENDANCE',
      entityId: input.staffUserId,
      context: { staffUserId: input.staffUserId, date: input.date, status: input.status },
    });

    return ok({
      staffUserId: input.staffUserId,
      date: input.date,
      status: input.status as StaffAttendanceViewStatus,
    });
  }
}
