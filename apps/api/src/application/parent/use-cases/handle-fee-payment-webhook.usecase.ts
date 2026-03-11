import type { Result } from '@shared/kernel';
import { ok, err, AppError } from '@shared/kernel';
import type { FeePaymentRepository } from '@domain/parent/ports/fee-payment.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { ClockPort } from '@application/common/clock.port';
import type { TransactionPort } from '@application/common/transaction.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import { TransactionLog } from '@domain/fee/entities/transaction-log.entity';
import { generateReceiptNumber } from '@domain/fee/rules/payment-request.rules';
import { DEFAULT_RECEIPT_PREFIX } from '@playconnect/contracts';
import { randomUUID } from 'node:crypto';

export interface FeeWebhookSignatureVerifier {
  verify(rawBody: Buffer, signature: string, timestamp: string): boolean;
}

export class HandleFeePaymentWebhookUseCase {
  constructor(
    private readonly feePaymentRepo: FeePaymentRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly transactionLogRepo: TransactionLogRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly signatureVerifier: FeeWebhookSignatureVerifier,
    private readonly clock: ClockPort,
    private readonly transaction: TransactionPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(
    rawBody: Buffer,
    headers: { signature: string; timestamp: string },
  ): Promise<Result<void, AppError>> {
    const valid = this.signatureVerifier.verify(rawBody, headers.signature, headers.timestamp);
    if (!valid) {
      this.logger.error('Invalid fee payment webhook signature');
      return err(AppError.unauthorized('Invalid webhook signature'));
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as WebhookPayload;
    } catch {
      this.logger.error('Fee payment webhook body is not valid JSON');
      return err(AppError.validation('Invalid webhook payload'));
    }

    const orderId = payload.data?.order?.order_id;
    const paymentStatus = payload.data?.payment?.payment_status;
    const cfPaymentId = payload.data?.payment?.cf_payment_id;

    if (!orderId || !paymentStatus) {
      this.logger.error('Fee payment webhook missing required fields', { orderId, paymentStatus });
      return ok(undefined);
    }

    const payment = await this.feePaymentRepo.findByOrderId(orderId);
    if (!payment) {
      this.logger.error('Fee payment webhook for unknown orderId', { orderId });
      return ok(undefined);
    }

    if (payment.status === 'SUCCESS') {
      this.logger.info('Ignoring webhook for already-succeeded fee payment', { orderId });
      return ok(undefined);
    }

    const now = this.clock.now();

    if (paymentStatus === 'SUCCESS') {
      const updated = payment.markSuccess(
        cfPaymentId ? String(cfPaymentId) : orderId,
        now,
      );

      // Load fee due and check if already paid (race condition)
      const feeDue = await this.loadFeeDueById(payment.feeDueId, payment.academyId, payment.studentId);

      if (!feeDue || feeDue.status === 'PAID') {
        // Fee was already marked paid by owner — mark payment as failed
        const failedPayment = payment.markFailed('ALREADY_PAID');
        await this.feePaymentRepo.save(failedPayment);
        this.logger.info('Fee already paid by owner, marking payment as failed', { orderId });
        return ok(undefined);
      }

      // Mark fee due as paid and create transaction log atomically
      const paidDue = feeDue.markPaidByParentOnline(payment.parentUserId, now);

      const academy = await this.academyRepo.findById(payment.academyId);
      const prefix = academy?.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX;
      const count = await this.transactionLogRepo.countByAcademyAndPrefix(payment.academyId, prefix);
      const receiptNumber = generateReceiptNumber(prefix, count + 1);

      const txLog = TransactionLog.create({
        id: randomUUID(),
        academyId: payment.academyId,
        feeDueId: payment.feeDueId,
        paymentRequestId: null,
        studentId: payment.studentId,
        monthKey: payment.monthKey,
        amount: payment.baseAmount,
        source: 'PARENT_ONLINE',
        collectedByUserId: payment.parentUserId,
        approvedByUserId: payment.parentUserId,
        receiptNumber,
      });

      await this.transaction.run(async () => {
        const transitioned = await this.feePaymentRepo.saveWithStatusPrecondition(updated, 'PENDING');
        if (!transitioned) {
          // Another concurrent webhook already processed this payment — idempotent success
          this.logger.info('Fee payment already transitioned from PENDING — skipping', { orderId });
          return;
        }

        await this.feeDueRepo.save(paidDue);
        await this.transactionLogRepo.save(txLog);
      });

      this.logger.info('Fee payment SUCCESS', {
        orderId,
        feeDueId: payment.feeDueId,
        academyId: payment.academyId,
      });
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'USER_DROPPED') {
      const updated = payment.markFailed(paymentStatus);
      await this.feePaymentRepo.save(updated);
      this.logger.info('Fee payment FAILED', { orderId, reason: paymentStatus });
    }

    return ok(undefined);
  }

  private async loadFeeDueById(feeDueId: string, _academyId: string, _studentId: string) {
    return this.feeDueRepo.findById(feeDueId);
  }
}

interface WebhookPayload {
  data?: {
    order?: {
      order_id?: string;
      order_amount?: number;
    };
    payment?: {
      payment_status?: string;
      cf_payment_id?: string | number;
    };
  };
}
