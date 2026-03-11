import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import { canViewOwnChildren } from '@domain/parent/rules/parent.rules';
import { ParentErrors } from '../../common/errors';
import type { PaymentHistoryItemDto } from '../dtos/parent.dto';
import type { UserRole } from '@playconnect/contracts';

export interface GetPaymentHistoryInput {
  parentUserId: string;
  parentRole: UserRole;
}

export class GetPaymentHistoryUseCase {
  constructor(
    private readonly linkRepo: ParentStudentLinkRepository,
    private readonly txLogRepo: TransactionLogRepository,
    private readonly studentRepo: StudentRepository,
  ) {}

  async execute(input: GetPaymentHistoryInput): Promise<Result<PaymentHistoryItemDto[], AppError>> {
    const check = canViewOwnChildren(input.parentRole);
    if (!check.allowed) return err(ParentErrors.childNotLinked());

    const links = await this.linkRepo.findByParentUserId(input.parentUserId);
    if (links.length === 0) return ok([]);

    const studentIds = links.map((l) => l.studentId);
    const [txLogs, students] = await Promise.all([
      this.txLogRepo.listByStudentIds(studentIds),
      this.studentRepo.findByIds(studentIds),
    ]);

    const nameMap = new Map(students.map((s) => [s.id.toString(), s.fullName]));

    const items: PaymentHistoryItemDto[] = txLogs.map((tx) => ({
      feeDueId: tx.feeDueId,
      receiptNumber: tx.receiptNumber,
      studentName: nameMap.get(tx.studentId) ?? 'Unknown',
      monthKey: tx.monthKey,
      amount: tx.amount,
      source: tx.source,
      paidAt: tx.audit.createdAt.toISOString(),
    }));

    return ok(items);
  }
}
