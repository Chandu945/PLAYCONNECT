import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { canMarkAttendance, validateLocalDate, validateDateRange } from '@domain/attendance/rules/attendance.rules';
import { AttendanceErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import { randomUUID } from 'crypto';

export interface BulkSetAbsencesInput {
  actorUserId: string;
  actorRole: UserRole;
  date: string;
  absentStudentIds: string[];
}

export interface BulkSetAbsencesOutput {
  date: string;
  absentCount: number;
}

export class BulkSetAbsencesUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly attendanceRepo: StudentAttendanceRepository,
    private readonly holidayRepo: HolidayRepository,
    private readonly auditRecorder: AuditRecorderPort,
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

    // Check holiday
    const holiday = await this.holidayRepo.findByAcademyAndDate(actor.academyId, input.date);
    if (holiday) {
      return err(AttendanceErrors.holidayDeclared());
    }

    // Validate unique IDs
    const uniqueIds = [...new Set(input.absentStudentIds)];

    // Validate all students belong to academy and are ACTIVE
    for (const studentId of uniqueIds) {
      const student = await this.studentRepo.findById(studentId);
      if (!student || student.isDeleted()) {
        return err(AttendanceErrors.studentNotFound(studentId));
      }
      if (student.academyId !== actor.academyId) {
        return err(AttendanceErrors.studentNotInAcademy());
      }
      if (student.status !== 'ACTIVE') {
        return err(AttendanceErrors.studentNotActive(studentId));
      }
    }

    // Get current absent records for the day
    const currentAbsent = await this.attendanceRepo.findAbsentByAcademyAndDate(
      actor.academyId,
      input.date,
    );
    const currentAbsentSet = new Set(currentAbsent.map((r) => r.studentId));
    const targetAbsentSet = new Set(uniqueIds);

    // Delete records not in target set
    for (const record of currentAbsent) {
      if (!targetAbsentSet.has(record.studentId)) {
        await this.attendanceRepo.deleteByAcademyStudentDate(
          actor.academyId,
          record.studentId,
          input.date,
        );
      }
    }

    // Create missing absent records
    for (const studentId of uniqueIds) {
      if (!currentAbsentSet.has(studentId)) {
        const record = StudentAttendance.create({
          id: randomUUID(),
          academyId: actor.academyId,
          studentId,
          date: input.date,
          markedByUserId: input.actorUserId,
        });
        await this.attendanceRepo.save(record);
      }
    }

    await this.auditRecorder.record({
      academyId: actor.academyId,
      actorUserId: input.actorUserId,
      action: 'STUDENT_ATTENDANCE_EDITED',
      entityType: 'STUDENT_ATTENDANCE',
      entityId: actor.academyId,
      context: { date: input.date, absentCount: String(uniqueIds.length) },
    });

    return ok({
      date: input.date,
      absentCount: uniqueIds.length,
    });
  }
}
