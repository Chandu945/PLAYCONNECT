import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import { StudentAttendance } from '@domain/attendance/entities/student-attendance.entity';
import type { StudentAttendanceRepository } from '@domain/attendance/ports/student-attendance.repository';
import type { HolidayRepository } from '@domain/attendance/ports/holiday.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import {
  canMarkAttendance,
  validateLocalDate,
  validateAttendanceStatus,
  validateDateRange,
} from '@domain/attendance/rules/attendance.rules';
import { AttendanceErrors } from '../../common/errors';
import type { StudentAttendanceStatus, UserRole } from '@playconnect/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import { randomUUID } from 'crypto';

export interface MarkStudentAttendanceInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  date: string;
  status: string;
}

export interface MarkStudentAttendanceOutput {
  studentId: string;
  date: string;
  status: StudentAttendanceStatus;
}

export class MarkStudentAttendanceUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly attendanceRepo: StudentAttendanceRepository,
    private readonly holidayRepo: HolidayRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(
    input: MarkStudentAttendanceInput,
  ): Promise<Result<MarkStudentAttendanceOutput, AppError>> {
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

    const statusCheck = validateAttendanceStatus(input.status);
    if (!statusCheck.valid) {
      return err(AppErrorClass.validation(statusCheck.reason!));
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(AttendanceErrors.academyRequired());
    }

    const student = await this.studentRepo.findById(input.studentId);
    if (!student || student.isDeleted()) {
      return err(AttendanceErrors.studentNotFound(input.studentId));
    }

    if (student.academyId !== actor.academyId) {
      return err(AttendanceErrors.studentNotInAcademy());
    }

    // Check holiday
    const holiday = await this.holidayRepo.findByAcademyAndDate(actor.academyId, input.date);
    if (holiday) {
      return err(AttendanceErrors.holidayDeclared());
    }

    if (input.status === 'ABSENT') {
      // Upsert absent record (idempotent)
      const existing = await this.attendanceRepo.findByAcademyStudentDate(
        actor.academyId,
        input.studentId,
        input.date,
      );
      if (!existing) {
        const record = StudentAttendance.create({
          id: randomUUID(),
          academyId: actor.academyId,
          studentId: input.studentId,
          date: input.date,
          markedByUserId: input.actorUserId,
        });
        await this.attendanceRepo.save(record);
      }
    } else {
      // PRESENT: delete absent record if exists (idempotent)
      await this.attendanceRepo.deleteByAcademyStudentDate(
        actor.academyId,
        input.studentId,
        input.date,
      );
    }

    await this.auditRecorder.record({
      academyId: actor.academyId,
      actorUserId: input.actorUserId,
      action: 'STUDENT_ATTENDANCE_EDITED',
      entityType: 'STUDENT_ATTENDANCE',
      entityId: input.studentId,
      context: { studentId: input.studentId, date: input.date, status: input.status },
    });

    return ok({
      studentId: input.studentId,
      date: input.date,
      status: input.status as StudentAttendanceStatus,
    });
  }
}
