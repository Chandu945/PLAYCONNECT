import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { ClockPort } from '../../common/clock.port';
import type { TransactionPort } from '../../common/transaction.port';
import { TransactionLog } from '@domain/fee/entities/transaction-log.entity';
import { canMarkPaid } from '@domain/fee/rules/fee.rules';
import { generateReceiptNumber } from '@domain/fee/rules/payment-request.rules';
import { FeeErrors } from '../../common/errors';
import type { FeeDueDto } from '../dtos/fee-due.dto';
import { toFeeDueDto } from '../dtos/fee-due.dto';
import type { UserRole, PaymentLabel } from '@playconnect/contracts';
import { DEFAULT_RECEIPT_PREFIX } from '@playconnect/contracts';
import { randomUUID } from 'crypto';

export interface MarkFeePaidInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  monthKey: string;
  paymentLabel?: PaymentLabel;
}

export class MarkFeePaidUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly transactionLogRepo: TransactionLogRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly clock: ClockPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(input: MarkFeePaidInput): Promise<Result<FeeDueDto, AppError>> {
    const check = canMarkPaid(input.actorRole);
    if (!check.allowed) return err(FeeErrors.markPaidNotAllowed());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const student = await this.studentRepo.findById(input.studentId);
    if (!student) return err(FeeErrors.studentNotFound(input.studentId));
    if (student.academyId !== user.academyId) return err(FeeErrors.studentNotInAcademy());

    const due = await this.feeDueRepo.findByAcademyStudentMonth(
      user.academyId,
      input.studentId,
      input.monthKey,
    );
    if (!due) return err(FeeErrors.dueNotFound(`${input.studentId}:${input.monthKey}`));

    if (due.status === 'PAID') return err(FeeErrors.alreadyPaid());

    const now = this.clock.now();

    // Generate receipt number
    const academy = await this.academyRepo.findById(user.academyId);
    const prefix = academy?.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX;

    const paid = due.markPaid(input.actorUserId, now, input.paymentLabel);

    await this.transaction.run(async () => {
      const count = await this.transactionLogRepo.countByAcademyAndPrefix(user.academyId, prefix);
      const receiptNumber = generateReceiptNumber(prefix, count + 1);

      const txLog = TransactionLog.create({
        id: randomUUID(),
        academyId: user.academyId,
        feeDueId: due.id.toString(),
        paymentRequestId: null,
        studentId: input.studentId,
        monthKey: input.monthKey,
        amount: due.amount,
        source: 'OWNER_DIRECT',
        collectedByUserId: input.actorUserId,
        approvedByUserId: input.actorUserId,
        receiptNumber,
      });

      await this.feeDueRepo.save(paid);
      await this.transactionLogRepo.save(txLog);
    });

    return ok(toFeeDueDto(paid));
  }
}
