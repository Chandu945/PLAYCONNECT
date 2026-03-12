import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import { canViewOwnChildren } from '@domain/parent/rules/parent.rules';
import { ParentErrors } from '../../common/errors';
import type { ReceiptOutput } from '../dtos/parent.dto';
import type { UserRole } from '@playconnect/contracts';

export interface GetReceiptInput {
  parentUserId: string;
  parentRole: UserRole;
  feeDueId: string;
}

export class GetReceiptUseCase {
  constructor(
    private readonly linkRepo: ParentStudentLinkRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly transactionLogRepo: TransactionLogRepository,
    private readonly studentRepo: StudentRepository,
    private readonly academyRepo: AcademyRepository,
  ) {}

  async execute(input: GetReceiptInput): Promise<Result<ReceiptOutput, AppError>> {
    const check = canViewOwnChildren(input.parentRole);
    if (!check.allowed) return err(ParentErrors.childNotLinked());

    // Find the transaction log for this fee due
    const txLog = await this.transactionLogRepo.findByFeeDueId(input.feeDueId);
    if (!txLog) return err(ParentErrors.feeDueNotFound(input.feeDueId));

    // Verify parent is linked to this student
    const link = await this.linkRepo.findByParentAndStudent(input.parentUserId, txLog.studentId);
    if (!link) return err(ParentErrors.childNotLinked());

    // Load student and academy names
    const [student, academy] = await Promise.all([
      this.studentRepo.findById(txLog.studentId),
      this.academyRepo.findById(txLog.academyId),
    ]);

    // Load fee due to get lateFeeApplied snapshot
    const feeDue = await this.feeDueRepo.findById(input.feeDueId);

    return ok({
      receiptNumber: txLog.receiptNumber,
      studentName: student?.fullName ?? 'Unknown',
      academyName: academy?.academyName ?? 'Unknown',
      monthKey: txLog.monthKey,
      amount: txLog.amount,
      lateFeeApplied: feeDue?.lateFeeApplied ?? null,
      paidAt: txLog.audit.createdAt.toISOString(),
      paymentMethod:
        txLog.source === 'PARENT_ONLINE'
          ? 'Online Payment'
          : txLog.source === 'STAFF_APPROVED'
            ? 'Staff Collection'
            : 'Direct Payment',
      source: txLog.source,
    });
  }
}
