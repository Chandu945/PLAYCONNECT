import type { Result } from '@shared/kernel';
import { ok, err, updateAuditFields } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { Student } from '@domain/student/entities/student.entity';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { canChangeStudentStatus } from '@domain/student/rules/student.rules';
import { StudentErrors } from '../../common/errors';
import type { StudentDto } from '../dtos/student.dto';
import { toStudentDto } from '../dtos/student.dto';
import type { StudentStatus, UserRole } from '@playconnect/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { TransactionPort } from '../../common/transaction.port';

export interface ChangeStudentStatusInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  status: StudentStatus;
  reason?: string;
}

export class ChangeStudentStatusUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly auditRecorder: AuditRecorderPort,
    private readonly feeDueRepo?: FeeDueRepository,
    private readonly transaction?: TransactionPort,
  ) {}

  async execute(input: ChangeStudentStatusInput): Promise<Result<StudentDto, AppError>> {
    const roleCheck = canChangeStudentStatus(input.actorRole);
    if (!roleCheck.allowed) {
      return err(StudentErrors.statusChangeNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(StudentErrors.academyRequired());
    }

    const student = await this.studentRepo.findById(input.studentId);
    if (!student || student.isDeleted()) {
      return err(StudentErrors.notFound(input.studentId));
    }

    if (student.academyId !== actor.academyId) {
      return err(StudentErrors.notInAcademy());
    }

    if (input.status === student.status) {
      return ok(toStudentDto(student));
    }

    const academyId = actor.academyId;

    const now = new Date();
    const historyEntry = {
      fromStatus: student.status,
      toStatus: input.status,
      changedBy: input.actorUserId,
      changedAt: now,
      reason: input.reason?.trim().slice(0, 500) ?? null,
    };

    const updated = Student.reconstitute(input.studentId, {
      academyId: student.academyId,
      fullName: student.fullName,
      fullNameNormalized: student.fullNameNormalized,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      address: student.address,
      guardian: student.guardian,
      joiningDate: student.joiningDate,
      monthlyFee: student.monthlyFee,
      mobileNumber: student.mobileNumber,
      email: student.email,
      profilePhotoUrl: student.profilePhotoUrl,
      fatherName: student.fatherName,
      motherName: student.motherName,
      aadhaarNumber: student.aadhaarNumber,
      caste: student.caste,
      whatsappNumber: student.whatsappNumber,
      addressText: student.addressText,
      instituteInfo: student.instituteInfo,
      passwordHash: student.passwordHash,
      status: input.status,
      statusChangedAt: now,
      statusChangedBy: input.actorUserId,
      statusHistory: [...student.statusHistory, historyEntry],
      audit: updateAuditFields(student.audit),
      softDelete: student.softDelete,
    });

    const saveOps = async () => {
      await this.studentRepo.save(updated);

      if (
        (input.status === 'INACTIVE' || input.status === 'LEFT') &&
        this.feeDueRepo
      ) {
        await this.feeDueRepo.deleteUpcomingByStudent(academyId, input.studentId);
      }
    };

    if (this.transaction) {
      await this.transaction.run(saveOps);
    } else {
      await saveOps();
    }

    await this.auditRecorder.record({
      academyId,
      actorUserId: input.actorUserId,
      action: 'STUDENT_STATUS_CHANGED',
      entityType: 'STUDENT',
      entityId: input.studentId,
      context: { fromStatus: student.status, newStatus: input.status, ...(input.reason ? { reason: input.reason } : {}) },
    });

    return ok(toStudentDto(updated));
  }
}
