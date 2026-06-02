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
import type { UserRole } from '@academyflo/contracts';
import { DEFAULT_RECEIPT_PREFIX } from '@academyflo/contracts';
import type { PushNotificationService } from '../../notifications/push-notification.service';
import { buildManualPaymentApprovedPush } from '../../notifications/templates/manual-payment-result-templates';
import { ConcurrentModificationError } from '@shared/errors/concurrent-modification.error';
import { randomUUID } from 'crypto';

export interface ApprovePaymentRequestInput {
  actorUserId: string;
  actorRole: UserRole;
  requestId: string;
}

/**
 * Sentinel error thrown inside the approve transaction when a concurrent
 * approval is detected. Caught outside transaction.run() and mapped to a
 * proper AppError so the caller sees a CONFLICT, not a 500.
 */
class ConcurrentApprovalError extends Error {
  constructor() {
    super('CONCURRENT_APPROVAL');
    this.name = 'ConcurrentApprovalError';
  }
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
    /**
     * Optional so legacy fixtures keep working. Production wiring always
     * passes the push service. Push failures never roll back the approval.
     */
    private readonly pushService?: PushNotificationService,
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

    // Reject underpayment. The app has no partial-payment concept, so a
    // request for less than the principal due must not silently close the fee
    // as fully paid (which would under-collect — e.g. a stale request created
    // before the fee amount increased). Overpayment is fine: the excess is
    // recorded as late fee via lateFeeApplied below.
    if (request.amount < due.amount) {
      return err(PaymentRequestErrors.amountBelowDue(request.amount, due.amount));
    }

    const now = this.clock.now();

    // Generate receipt number
    const academy = await this.academyRepo.findById(request.academyId);
    const prefix = academy?.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX;

    // Late fee is derived from the parent's actual payment, not recomputed.
    // The parent paid `request.amount`; the principal is capped at `due.amount`,
    // and anything above is treated as late-fee remitted. This keeps three
    // numbers consistent: TransactionLog.amount (cash), FeeDue.amount (base),
    // FeeDue.lateFeeApplied (late fee actually paid). Recomputing at approval
    // would let computeLateFee drift past the parent's submission window and
    // produce reports where (amount + lateFeeApplied) ≠ what the parent paid.
    const lateFeeApplied = Math.max(0, request.amount - due.amount);

    // Atomic: approve request + mark due paid + create transaction log
    const approved = request.approve(input.actorUserId, now);
    const paidDue = due.markPaidByApproval({
      approvedByUserId: input.actorUserId,
      collectedByUserId: request.staffUserId,
      paymentRequestId: request.id.toString(),
      paidAt: now,
      lateFeeApplied,
    });

    try {
      await this.transaction.run(async () => {
        // Re-check payment request status INSIDE transaction to prevent race condition
        // where two concurrent approval requests both pass the earlier PENDING check.
        // The version check on save() would also catch this, but this early check
        // avoids creating orphaned transaction logs. Throwing a sentinel so we can
        // map it to a proper AppError after the transaction aborts, rather than
        // surfacing as a 500.
        const freshRequest = await this.paymentRequestRepo.findById(input.requestId);
        if (!freshRequest || freshRequest.status !== 'PENDING') {
          throw new ConcurrentApprovalError();
        }

        const next = await this.transactionLogRepo.incrementReceiptCounter(
          request.academyId,
          prefix,
        );
        const receiptNumber = generateReceiptNumber(prefix, next);

        // Transaction-log source depends on who authored the request:
        //   STAFF cash collection  → 'STAFF_APPROVED'
        //   PARENT manual payment  → 'MANUAL'
        // Both require owner approval and flow through this same code path;
        // only the recorded provenance differs.
        const txLogSource = request.source === 'PARENT' ? 'MANUAL' : 'STAFF_APPROVED';

        // Persist the principal/late-fee split alongside the gross amount.
        // baseAmount is whatever the parent paid toward base (capped at
        // due.amount); the rest is late fee. Same derivation as
        // FeeDue.lateFeeApplied above so the two records stay reconcilable.
        const baseAmount = Math.min(request.amount, due.amount);
        const lateFeeAmount = lateFeeApplied;

        const txLog = TransactionLog.create({
          id: randomUUID(),
          academyId: request.academyId,
          feeDueId: due.id.toString(),
          paymentRequestId: request.id.toString(),
          studentId: request.studentId,
          monthKey: request.monthKey,
          amount: request.amount,
          baseAmount,
          lateFeeAmount,
          source: txLogSource,
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
    } catch (e) {
      if (e instanceof ConcurrentApprovalError) {
        return err(PaymentRequestErrors.notPending());
      }
      // M2 fix: an optimistic-concurrency clash on FeeDue.save (or any
      // other repo save inside the transaction) means a concurrent path
      // already mutated the fee — almost always another approval, a
      // direct mark-paid, or a Cashfree webhook completing online payment
      // for the same fee. The transaction rolled back cleanly; the right
      // response is a domain-shaped CONFLICT ("already paid"), not the
      // generic 'ConcurrentModification' 409 that GlobalExceptionFilter
      // would otherwise produce by catching the bare error.
      if (e instanceof ConcurrentModificationError) {
        return err(PaymentRequestErrors.alreadyPaid());
      }
      throw e;
    }

    // Resolve names for response
    const [staffUser, student] = await Promise.all([
      this.userRepo.findById(approved.staffUserId),
      this.studentRepo.findById(approved.studentId),
    ]);

    // Notify the parent only when this approval is for a parent-submitted
    // manual payment. Staff-submitted requests don't need a push to the
    // staff who created them — staff see the result in the in-app queue.
    if (this.pushService && approved.source === 'PARENT' && student) {
      try {
        const message = buildManualPaymentApprovedPush({
          studentName: student.fullName,
          monthKey: approved.monthKey,
          academyId: approved.academyId,
          paymentRequestId: approved.id.toString(),
          studentId: approved.studentId,
        });
        // approved.staffUserId stores the parent's userId for PARENT-source
        // requests (see PaymentRequest entity comment).
        await this.pushService.sendToUsers([approved.staffUserId], message);
      } catch {
        // Swallow — payment is already approved and recorded.
      }
    }

    return ok(
      toPaymentRequestDto(approved, {
        staffName: staffUser?.fullName,
        studentName: student?.fullName,
        reviewedByName: user.fullName,
      }),
    );
  }
}
