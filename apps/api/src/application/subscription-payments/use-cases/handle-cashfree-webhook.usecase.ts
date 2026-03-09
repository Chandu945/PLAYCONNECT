import type { Result } from '@shared/kernel';
import { ok, err, AppError } from '@shared/kernel';
import type { SubscriptionPaymentRepository } from '@domain/subscription-payments/ports/subscription-payment.repository';
import type { SubscriptionRepository } from '@domain/subscription/ports/subscription.repository';
import type { ClockPort } from '@application/common/clock.port';
import type { TransactionPort } from '@application/common/transaction.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import { Subscription } from '@domain/subscription/entities/subscription.entity';
import { computePaidDates } from '@domain/subscription-payments/rules/subscription-payment.rules';

export interface WebhookSignatureVerifier {
  verify(rawBody: Buffer, signature: string, timestamp: string): boolean;
}

export class HandleCashfreeWebhookUseCase {
  constructor(
    private readonly paymentRepo: SubscriptionPaymentRepository,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly signatureVerifier: WebhookSignatureVerifier,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly transaction?: TransactionPort,
  ) {}

  async execute(
    rawBody: Buffer,
    headers: { signature: string; timestamp: string },
  ): Promise<Result<void, AppError>> {
    // 1. Verify signature on raw body BEFORE parsing
    const valid = this.signatureVerifier.verify(
      rawBody,
      headers.signature,
      headers.timestamp,
    );
    if (!valid) {
      this.logger.error('Invalid webhook signature');
      return err(AppError.unauthorized('Invalid webhook signature'));
    }

    // 2. Parse JSON AFTER verification
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as WebhookPayload;
    } catch {
      this.logger.error('Webhook body is not valid JSON');
      return err(AppError.validation('Invalid webhook payload'));
    }

    const orderId = payload.data?.order?.order_id;
    const paymentStatus = payload.data?.payment?.payment_status;
    const cfPaymentId = payload.data?.payment?.cf_payment_id;

    if (!orderId || !paymentStatus) {
      this.logger.error('Webhook missing required fields', { orderId, paymentStatus });
      // Ack to avoid retries — but log for monitoring
      return ok(undefined);
    }

    // 3. Load payment by orderId
    const payment = await this.paymentRepo.findByOrderId(orderId);
    if (!payment) {
      // Unknown order — ack without error to avoid Cashfree retry storms
      this.logger.error('Webhook for unknown orderId', { orderId });
      return ok(undefined);
    }

    // 4. Idempotency checks
    if (payment.status === 'SUCCESS') {
      // Already succeeded — ignore any further events
      this.logger.info('Ignoring webhook for already-succeeded payment', { orderId });
      return ok(undefined);
    }

    const now = this.clock.now();

    if (paymentStatus === 'SUCCESS') {
      // Mark payment as SUCCESS and activate subscription atomically
      const updated = payment.markSuccess(
        cfPaymentId ? String(cfPaymentId) : orderId,
        now,
      );

      const saveAndActivate = async () => {
        const transitioned = await this.paymentRepo.saveWithStatusPrecondition(updated, 'PENDING');
        if (!transitioned) {
          // Another concurrent webhook already processed this payment — idempotent success
          this.logger.info('Payment already transitioned from PENDING — skipping', { orderId });
          return;
        }
        await this.activateSubscription(payment.academyId, payment.tierKey, orderId, cfPaymentId, now);
      };

      if (this.transaction) {
        await this.transaction.run(saveAndActivate);
      } else {
        await saveAndActivate();
      }

      this.logger.info('Payment SUCCESS — subscription activated', {
        orderId,
        academyId: payment.academyId,
        tierKey: payment.tierKey,
      });
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'USER_DROPPED') {
      // payment.status !== 'SUCCESS' is guaranteed by the early return above (line 66)
      const updated = payment.markFailed(paymentStatus);
      await this.paymentRepo.save(updated);
      this.logger.info('Payment FAILED', { orderId, reason: paymentStatus });
    }

    return ok(undefined);
  }

  private async activateSubscription(
    academyId: string,
    tierKey: string,
    orderId: string,
    cfPaymentId: string | number | undefined,
    now: Date,
  ): Promise<void> {
    const subscription = await this.subscriptionRepo.findByAcademyId(academyId);
    if (!subscription) {
      this.logger.error('No subscription found for academy during activation', { academyId });
      return;
    }

    let effectiveNow = now;
    // If subscription has an active paid period that hasn't ended yet,
    // extend from the day after paidEndAt instead of from now
    if (subscription.paidEndAt && subscription.paidEndAt.getTime() > now.getTime()) {
      effectiveNow = new Date(subscription.paidEndAt.getTime() + 24 * 60 * 60 * 1000);
    }

    const { paidStartAt, paidEndAt } = computePaidDates(effectiveNow, subscription.trialEndAt);

    const paymentRef = cfPaymentId ? `${orderId}/${cfPaymentId}` : orderId;

    const activated = Subscription.reconstitute(subscription.id.toString(), {
      academyId: subscription.academyId,
      trialStartAt: subscription.trialStartAt,
      trialEndAt: subscription.trialEndAt,
      paidStartAt,
      paidEndAt,
      tierKey: tierKey as import('@playconnect/contracts').TierKey,
      pendingTierKey: null,
      pendingTierEffectiveAt: null,
      activeStudentCountSnapshot: subscription.activeStudentCountSnapshot,
      manualNotes: subscription.manualNotes,
      paymentReference: paymentRef,
      audit: {
        createdAt: subscription.audit.createdAt,
        updatedAt: now,
        version: subscription.audit.version + 1,
      },
    });

    await this.subscriptionRepo.save(activated);
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
