import type { Result } from '@shared/kernel';
import { ok, err, updateAuditFields, markDeleted } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { Student } from '@domain/student/entities/student.entity';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { canDeleteStudent } from '@domain/student/rules/student.rules';
import { StudentErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';

export interface SoftDeleteStudentInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
}

export class SoftDeleteStudentUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly auditRecorder: AuditRecorderPort,
    private readonly feeDueRepo?: FeeDueRepository,
  ) {}

  async execute(input: SoftDeleteStudentInput): Promise<Result<{ id: string }, AppError>> {
    const roleCheck = canDeleteStudent(input.actorRole);
    if (!roleCheck.allowed) {
      return err(StudentErrors.deleteNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(StudentErrors.academyRequired());
    }

    const student = await this.studentRepo.findById(input.studentId);
    if (!student) {
      return err(StudentErrors.notFound(input.studentId));
    }

    if (student.isDeleted()) {
      return err(StudentErrors.alreadyDeleted());
    }

    if (student.academyId !== actor.academyId) {
      return err(StudentErrors.notInAcademy());
    }

    const deleted = Student.reconstitute(input.studentId, {
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
      status: student.status,
      statusChangedAt: student.statusChangedAt,
      statusChangedBy: student.statusChangedBy,
      statusHistory: student.statusHistory,
      audit: updateAuditFields(student.audit),
      softDelete: markDeleted(input.actorUserId),
    });

    await this.studentRepo.save(deleted);

    if (this.feeDueRepo) {
      await this.feeDueRepo.deleteUpcomingByStudent(actor.academyId, input.studentId);
    }

    await this.auditRecorder.record({
      academyId: actor.academyId,
      actorUserId: input.actorUserId,
      action: 'STUDENT_DELETED',
      entityType: 'STUDENT',
      entityId: input.studentId,
      context: { studentId: input.studentId },
    });

    return ok({ id: input.studentId });
  }
}
