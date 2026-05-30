import type { Result } from '@shared/kernel';
import { ok, err, updateAuditFields } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { Student } from '@domain/student/entities/student.entity';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import {
  canChangeStudentStatus,
  validateStatusChangeReason,
} from '@domain/student/rules/student.rules';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { EmailSenderPort } from '../../notifications/ports/email-sender.port';
import { renderStudentStatusChangedEmail } from '../../notifications/templates/student-status-changed-template';
import type { PushNotificationService } from '../../notifications/push-notification.service';
import { buildStudentStatusChangedPush } from '../../notifications/templates/student-status-changed-push-template';
import { StudentErrors } from '../../common/errors';
import type { StudentDto } from '../dtos/student.dto';
import { toStudentDto } from '../dtos/student.dto';

export interface ChangeStudentStatusOutput {
  student: StudentDto;
  deletedUpcomingDuesCount: number;
}
import type { StudentStatus, UserRole } from '@academyflo/contracts';
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
    private readonly emailSender?: EmailSenderPort,
    private readonly academyRepo?: AcademyRepository,
    /**
     * Used to find parent userIds linked to the student so we can push them
     * (M2 fix). Optional so legacy fixtures keep working — without it the
     * push is skipped and only the email backup channel fires.
     */
    private readonly parentLinkRepo?: ParentStudentLinkRepository,
    /**
     * Used to notify parents about status changes via push (M2 fix). Push
     * is the primary channel; email stays as the backup for parents who
     * haven't installed the app. Optional; push failures don't roll back
     * the status change.
     */
    private readonly pushService?: PushNotificationService,
    /**
     * Clears the student's batch enrollments when they leave ACTIVE status
     * (INACTIVE/LEFT), freeing their slot so a batch's enrolled count stays
     * consistent with its active-only roster. Optional so legacy fixtures keep
     * working — without it the enrollments are left in place.
     */
    private readonly studentBatchRepo?: StudentBatchRepository,
  ) {}

  async execute(
    input: ChangeStudentStatusInput,
  ): Promise<Result<ChangeStudentStatusOutput, AppError>> {
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
      return ok({ student: toStudentDto(student), deletedUpcomingDuesCount: 0 });
    }

    // L5 fix: validate reason length up-front instead of silently truncating.
    // The prior `slice(0, 500)` was both a data-loss bug (callers thought
    // they recorded a long reason) and a consistency bug (audit log stored
    // the truncated prefix while push / email templates used the full
    // untruncated value). Normalize to a single trimmed value used by every
    // downstream consumer.
    const trimmedReason = input.reason?.trim() ?? null;
    if (trimmedReason !== null) {
      const reasonCheck = validateStatusChangeReason(trimmedReason);
      if (!reasonCheck.valid) {
        return err(AppErrorClass.validation(reasonCheck.reason!));
      }
    }

    const loadedVersion = student.audit.version;

    const academyId = actor.academyId;

    const now = new Date();
    const historyEntry = {
      fromStatus: student.status,
      toStatus: input.status,
      changedBy: input.actorUserId,
      changedAt: now,
      reason: trimmedReason,
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
      whatsappNumber: student.whatsappNumber,
      addressText: student.addressText,
      status: input.status,
      statusChangedAt: now,
      statusChangedBy: input.actorUserId,
      statusHistory: [...student.statusHistory, historyEntry],
      audit: updateAuditFields(student.audit),
      softDelete: student.softDelete,
    });

    const isLeavingActive = input.status === 'INACTIVE' || input.status === 'LEFT';
    const needsFeeCleanup = isLeavingActive && this.feeDueRepo;
    // Free the student's batch slots when they leave ACTIVE status, mirroring
    // soft-delete. Keeps the enrolled count (used for capacity) consistent with
    // the active-only roster, so a batch isn't wrongly "full" of inactive
    // students. A reactivated student must be re-assigned to batches.
    const needsBatchCleanup = isLeavingActive && this.studentBatchRepo;

    // SAFETY: If fee or batch cleanup is needed, a transaction is required to
    // keep the student status change and the cascading deletes atomic. Without
    // a transaction, a failure after save but before delete (or vice-versa)
    // leaves data inconsistent. We previously warned and proceeded — that
    // risked silent data corruption in production. Now we hard-fail so the
    // misconfiguration is caught at the request boundary, not days later via a
    // stale dashboard.
    if ((needsFeeCleanup || needsBatchCleanup) && !this.transaction) {
      throw new Error(
        '[ChangeStudentStatusUseCase] TransactionPort is required when changing status to INACTIVE/LEFT (fee + batch cleanup must be atomic). Inject TransactionPort.',
      );
    }

    let conflicted = false;
    let deletedDues = 0;
    const saveOps = async () => {
      const saved = await this.studentRepo.saveWithVersionPrecondition(updated, loadedVersion);
      if (!saved) {
        conflicted = true;
        return;
      }

      if (needsFeeCleanup) {
        deletedDues = await this.feeDueRepo!.deleteUpcomingByStudent(academyId, input.studentId);
      }

      if (needsBatchCleanup) {
        // Empty assignment list = remove all of this student's batch rows.
        await this.studentBatchRepo!.replaceForStudent(input.studentId, []);
      }
    };

    if (this.transaction) {
      await this.transaction.run(saveOps);
    } else {
      await saveOps();
    }

    if (conflicted) return err(StudentErrors.concurrencyConflict());

    await this.auditRecorder.record({
      academyId,
      actorUserId: input.actorUserId,
      action: 'STUDENT_STATUS_CHANGED',
      entityType: 'STUDENT',
      entityId: input.studentId,
      context: {
        fromStatus: student.status,
        newStatus: input.status,
        deletedUpcomingDuesCount: String(deletedDues),
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      },
    });

    // M2 fix: push notification to all linked parents. Primary channel —
    // immediate and reliable for parents with the app installed. The email
    // below stays as the backup channel for parents who haven't installed.
    // Best-effort: a push failure must not roll back the status change.
    if (this.pushService && this.parentLinkRepo) {
      try {
        const links = await this.parentLinkRepo.findByStudentId(input.studentId);
        const parentUserIds = links.map((l) => l.parentUserId);
        if (parentUserIds.length > 0) {
          const message = buildStudentStatusChangedPush({
            studentName: student.fullName,
            academyId,
            studentId: input.studentId,
            newStatus: input.status,
            reason: trimmedReason,
          });
          await this.pushService.sendToUsers(parentUserIds, message);
        }
      } catch {
        // Swallow — status change is already saved + audited. Email backup
        // (below) still fires for parents with email on file.
      }
    }

    // Fire-and-forget: notify parent/guardian about student status change
    if (this.emailSender && this.academyRepo) {
      const parentEmail = student.guardian?.email || student.email;
      if (parentEmail) {
        // L6 fix: `actor.academyId` was guarded with `?? ''` here even though
        // we already returned an error at line ~70 if it was null. Reuse the
        // local `academyId` (extracted on line ~95) which is unambiguously
        // a non-empty string at this point.
        const academy = await this.academyRepo.findById(academyId);
        this.emailSender
          .send({
            to: parentEmail,
            subject: `Student Status Update - ${student.fullName}`,
            html: renderStudentStatusChangedEmail({
              parentName: student.guardian?.name ?? 'Parent/Guardian',
              studentName: student.fullName,
              academyName: academy?.academyName ?? 'Your Academy',
              newStatus: input.status,
              reason: trimmedReason,
            }),
          })
          .catch(() => {});
      }
    }

    return ok({ student: toStudentDto(updated), deletedUpcomingDuesCount: deletedDues });
  }
}
