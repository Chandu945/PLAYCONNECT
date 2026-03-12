import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '@domain/fee/ports/payment-request.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { ClockPort } from '../../common/clock.port';
import type { TransactionPort } from '../../common/transaction.port';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import { AuditLog } from '@domain/audit/entities/audit-log.entity';
import { sanitizeContext } from '@domain/audit/rules/audit.rules';
import { TransactionLog } from '@domain/fee/entities/transaction-log.entity';
import { canReviewPaymentRequest } from '@domain/fee/rules/payment-request.rules';
import { generateReceiptNumber } from '@domain/fee/rules/payment-request.rules';
import { PaymentRequestErrors } from '../../common/errors';
import type { PaymentRequestDto } from '../dtos/payment-request.dto';
import { toPaymentRequestDto } from '../dtos/payment-request.dto';
import type { UserRole, LateFeeConfig, LateFeeRepeatInterval } from '@playconnect/contracts';
import { DEFAULT_RECEIPT_PREFIX, computeLateFee } from '@playconnect/contracts';
import { randomUUID } from 'crypto';

export interface ApprovePaymentRequestInput {
  actorUserId: string;
  actorRole: UserRole;
  requestId: string;
}

export class ApprovePaymentRequestUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly paymentRequestRepo: PaymentRequestRepository,
    private readonly transactionLogRepo: TransactionLogRepository,
    private readonly studentRepo: StudentRepository,
    private readonly clock: ClockPort,
    private readonly transaction: TransactionPort,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  async execute(input: ApprovePaymentRequestInput): Promise<Result<PaymentRequestDto, AppError>> {
    const check = canReviewPaymentRequest(input.actorRole);
    if (!check.allowed) return err(PaymentRequestErrors.reviewNotAllowed());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(PaymentRequestErrors.academyRequired());

    const request = await this.paymentRequestRepo.findById(input.requestId);
    if (!request) return err(PaymentRequestErrors.requestNotFound(input.requestId));
    if (request.academyId !== user.academyId)
      return err(PaymentRequestErrors.requestNotInAcademy());
    if (request.status !== 'PENDING') return err(PaymentRequestErrors.notPending());

    const due = await this.feeDueRepo.findByAcademyStudentMonth(
      request.academyId,
      request.studentId,
      request.monthKey,
    );
    if (!due)
      return err(PaymentRequestErrors.dueNotFound(`${request.studentId}:${request.monthKey}`));
    if (due.status === 'PAID') return err(PaymentRequestErrors.alreadyPaid());

    const now = this.clock.now();

    // Generate receipt number
    const academy = await this.academyRepo.findById(request.academyId);
    const prefix = academy?.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX;

    // Compute late fee snapshot — prefer snapshotted config, fall back to live academy config
    const todayStr = now.toISOString().slice(0, 10);
    let lateFeeApplied = 0;
    const liveConfig: LateFeeConfig | undefined = academy?.lateFeeEnabled
      ? {
          lateFeeEnabled: academy.lateFeeEnabled,
          gracePeriodDays: academy.gracePeriodDays,
          lateFeeAmountInr: academy.lateFeeAmountInr,
          lateFeeRepeatIntervalDays: academy.lateFeeRepeatIntervalDays as LateFeeRepeatInterval,
        }
      : undefined;
    const effectiveConfig = due.lateFeeConfigSnapshot ?? liveConfig;
    if (effectiveConfig) {
      lateFeeApplied = computeLateFee(due.dueDate, todayStr, effectiveConfig);
    }

    // Atomic: approve request + mark due paid + create transaction log
    const approved = request.approve(input.actorUserId, now);
    const paidDue = due.markPaidByApproval({
      approvedByUserId: input.actorUserId,
      collectedByUserId: request.staffUserId,
      paymentRequestId: request.id.toString(),
      paidAt: now,
      lateFeeApplied,
    });

    await this.transaction.run(async () => {
      const count = await this.transactionLogRepo.countByAcademyAndPrefix(request.academyId, prefix);
      const receiptNumber = generateReceiptNumber(prefix, count + 1);

      const txLog = TransactionLog.create({
        id: randomUUID(),
        academyId: request.academyId,
        feeDueId: due.id.toString(),
        paymentRequestId: request.id.toString(),
        studentId: request.studentId,
        monthKey: request.monthKey,
        amount: request.amount,
        source: 'STAFF_APPROVED',
        collectedByUserId: request.staffUserId,
        approvedByUserId: input.actorUserId,
        receiptNumber,
      });

      const auditLog = AuditLog.create({
        academyId: request.academyId,
        actorUserId: input.actorUserId,
        action: 'PAYMENT_REQUEST_APPROVED',
        entityType: 'PAYMENT_REQUEST',
        entityId: request.id.toString(),
        context: sanitizeContext({
          studentId: request.studentId,
          monthKey: request.monthKey,
          receiptNumber,
        }),
      });

      await this.paymentRequestRepo.save(approved);
      await this.feeDueRepo.save(paidDue);
      await this.transactionLogRepo.save(txLog);
      await this.auditLogRepo.save(auditLog);
    });

    // Resolve names for response
    const [staffUser, student] = await Promise.all([
      this.userRepo.findById(approved.staffUserId),
      this.studentRepo.findById(approved.studentId),
    ]);

    return ok(toPaymentRequestDto(approved, {
      staffName: staffUser?.fullName,
      studentName: student?.fullName,
      reviewedByName: user.fullName,
    }));
  }
}
