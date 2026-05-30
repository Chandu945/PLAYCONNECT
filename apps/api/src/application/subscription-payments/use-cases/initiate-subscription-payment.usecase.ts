import type { Result } from '@shared/kernel';
import { ok, err, AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '@domain/subscription/ports/subscription.repository';
import type { SubscriptionPaymentRepository } from '@domain/subscription-payments/ports/subscription-payment.repository';
import type { CashfreeGatewayPort } from '@domain/subscription-payments/ports/cashfree-gateway.port';
import type { ActiveStudentCounterPort } from '@application/subscription/ports/active-student-counter.port';
import type { ClockPort } from '@application/common/clock.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { AuditRecorderPort } from '@application/audit/ports/audit-recorder.port';
import { SubscriptionPayment } from '@domain/subscription-payments/entities/subscription-payment.entity';
import { requiredTierForCount } from '@domain/subscription/rules/subscription-tier.rules';
import {
  priceForTier,
  generateOrderId,
} from '@domain/subscription-payments/rules/subscription-payment.rules';
import type { InitiatePaymentOutput } from '../dtos/subscription-payment.dto';
import { randomUUID } from 'node:crypto';

export class InitiateSubscriptionPaymentUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly paymentRepo: SubscriptionPaymentRepository,
    private readonly cashfreeGateway: CashfreeGatewayPort,
    private readonly studentCounter: ActiveStudentCounterPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(actorUserId: string): Promise<Result<InitiatePaymentOutput, AppError>> {
    // Validate actor is OWNER
    const user = await this.userRepo.findById(actorUserId);
    if (!user) return err(AppError.notFound('User', actorUserId));
    if (user.role !== 'OWNER') return err(AppError.forbidden('Only owners can initiate payments'));

    // Resolve academy
    let academyId = user.academyId;
    let academy;

    if (academyId) {
      academy = await this.academyRepo.findById(academyId);
    }
    if (!academy) {
      academy = await this.academyRepo.findByOwnerUserId(actorUserId);
      if (academy) academyId = academy.id.toString();
    }

    if (!academy || !academyId) {
      return err(new AppError('ACADEMY_SETUP_REQUIRED', 'Please complete academy setup first'));
    }

    // Block if academy login is disabled
    if (academy.loginDisabled) {
      return err(AppError.forbidden('Cannot initiate payment for a disabled academy'));
    }

    // Check for existing PENDING payment
    const existingPending = await this.paymentRepo.findPendingByAcademyId(academyId);
    if (existingPending) {
      // If the PENDING payment is young enough that its Cashfree session is
      // still alive (sessions typically live 15+ minutes), hand the same
      // orderId + paymentSessionId back to the client. This avoids creating
      // orphaned orders in Cashfree when users double-tap / refresh /
      // reopen the tab shortly after initiating.
      const nowMs = this.clock.now().getTime();
      const ageMs = nowMs - existingPending.audit.createdAt.getTime();
      const RESUME_WINDOW_MS = 5 * 60 * 1000;
      if (
        ageMs < RESUME_WINDOW_MS &&
        existingPending.paymentSessionId &&
        existingPending.cfOrderId
      ) {
        this.logger.info('Resuming existing PENDING payment', {
          academyId,
          orderId: existingPending.orderId,
          ageMs,
        });
        return ok({
          orderId: existingPending.orderId,
          paymentSessionId: existingPending.paymentSessionId,
          amountInr: existingPending.amountInr,
          currency: existingPending.currency,
          tierKey: existingPending.tierKey,
          // We didn't persist the original expiry — surface an ISO string that
          // reflects the known window so the client can time its polling.
          expiresAt: new Date(
            existingPending.audit.createdAt.getTime() + RESUME_WINDOW_MS,
          ).toISOString(),
        });
      }

      // Older than the resume window (or missing session details from a prior
      // failed init) — expire and create fresh. User explicitly clicked "Try
      // Again" so the stale Cashfree session is abandoned.
      const expired = existingPending.markFailed('SUPERSEDED_BY_RETRY');
      const transitioned = await this.paymentRepo.saveWithStatusPrecondition(expired, 'PENDING');
      if (!transitioned) {
        // Another request already transitioned (e.g. webhook arrived) — safe to proceed
        this.logger.info('PENDING payment already transitioned by another process', {
          academyId,
          orderId: existingPending.orderId,
        });
      } else {
        this.logger.info('Expired previous PENDING payment on retry', {
          academyId,
          orderId: existingPending.orderId,
        });
      }
    }

    // Load subscription
    const subscription = await this.subscriptionRepo.findByAcademyId(academyId);
    if (!subscription) {
      return err(AppError.notFound('Subscription'));
    }

    // Compute tier + amount. Bill on the cycle PEAK (the max eligible count
    // across the cycle, with a 24h grace for newly-added records) — the same
    // number GetMySubscription shows as the "Required Tier" — so owners can't
    // dodge an upgrade by flexing their roster down right before renewal, and
    // the charge matches the price shown in the app. activeStudentCount is kept
    // only as a record of the real-time roster at purchase time.
    const now = this.clock.now();
    const PEAK_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;
    const activeStudentCount = await this.studentCounter.countActiveStudents(academyId, now);
    const eligibleStudentCount = await this.studentCounter.countEligibleStudents(
      academyId,
      now,
      PEAK_GRACE_PERIOD_MS,
    );
    const peakStudentCount = Math.max(
      subscription.peakStudentCountThisCycle ?? eligibleStudentCount,
      eligibleStudentCount,
    );
    const requiredTier = requiredTierForCount(peakStudentCount);
    const amountInr = priceForTier(requiredTier);

    // Create order id and persist PENDING payment record BEFORE calling Cashfree
    const orderId = generateOrderId();
    // Derive the idempotency key deterministically from orderId so a network
    // retry of this initiate call (where the first createOrder already reached
    // Cashfree but the response was lost) reuses the same key and Cashfree
    // dedupes correctly. The 5-min resume window above already keeps orderId
    // stable across short retries; this provides defense-in-depth without
    // needing to persist a separate idempotencyKey field on the entity.
    const idempotencyKey = `idemp_${orderId}`;

    const payment = SubscriptionPayment.create({
      id: randomUUID(),
      academyId,
      ownerUserId: actorUserId,
      orderId,
      paymentSessionId: '',
      tierKey: requiredTier,
      amountInr,
      activeStudentCountAtPurchase: activeStudentCount,
    });
    try {
      await this.paymentRepo.save(payment);
    } catch (error) {
      // Partial unique index on {academyId, status:PENDING} rejects a concurrent
      // second initiate. Surface as a proper 409 instead of a generic 500.
      const err11000 = (error as { code?: number })?.code === 11000;
      if (err11000) {
        return err(AppError.conflict('A payment is already in progress for this academy'));
      }
      throw error;
    }

    // Call Cashfree API
    let cfResult;
    try {
      cfResult = await this.cashfreeGateway.createOrder({
        orderId,
        orderAmount: amountInr,
        orderCurrency: 'INR',
        customerId: actorUserId,
        customerPhone: user.phoneE164,
        idempotencyKey,
      });
    } catch (error) {
      this.logger.error('Cashfree createOrder failed', {
        academyId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // M1 fix (subscription audit): CAS. A concurrent webhook (unlikely on
      // this path since createOrder hasn't returned yet, but a retried
      // request that succeeded on the gateway side might race) could have
      // already transitioned this payment out of PENDING. Don't clobber.
      const failed = payment.markFailed('CASHFREE_CREATE_ORDER_FAILED');
      await this.paymentRepo.saveWithStatusPrecondition(failed, 'PENDING');
      return err(
        new AppError(
          'PAYMENT_PROVIDER_UNAVAILABLE',
          'Payment provider is temporarily unavailable. Please try again.',
        ),
      );
    }

    // Validate Cashfree response
    if (!cfResult.paymentSessionId || !cfResult.cfOrderId) {
      this.logger.error('Cashfree createOrder returned incomplete response', {
        academyId,
        orderId,
        hasCfOrderId: !!cfResult.cfOrderId,
        hasPaymentSessionId: !!cfResult.paymentSessionId,
      });
      // M1 fix (subscription audit): CAS same as the createOrder-failure
      // branch above.
      const failed = payment.markFailed('CASHFREE_INVALID_RESPONSE');
      await this.paymentRepo.saveWithStatusPrecondition(failed, 'PENDING');
      return err(
        new AppError(
          'PAYMENT_PROVIDER_UNAVAILABLE',
          'Payment provider returned an invalid response. Please try again.',
        ),
      );
    }

    // Update payment with Cashfree details
    const withCfId = payment.setCfOrderId(cfResult.cfOrderId);
    const withCfDetails = SubscriptionPayment.reconstitute(withCfId.id.toString(), {
      academyId: withCfId.academyId,
      ownerUserId: withCfId.ownerUserId,
      orderId: withCfId.orderId,
      cfOrderId: withCfId.cfOrderId,
      paymentSessionId: cfResult.paymentSessionId,
      tierKey: withCfId.tierKey,
      amountInr: withCfId.amountInr,
      currency: withCfId.currency,
      activeStudentCountAtPurchase: withCfId.activeStudentCountAtPurchase,
      status: withCfId.status,
      failureReason: withCfId.failureReason,
      paidAt: withCfId.paidAt,
      providerPaymentId: withCfId.providerPaymentId,
      audit: withCfId.audit,
    });
    await this.paymentRepo.save(withCfDetails);

    this.logger.info('Subscription payment initiated', {
      academyId,
      orderId,
      tierKey: requiredTier,
      amountInr,
    });

    await this.auditRecorder.record({
      academyId,
      actorUserId,
      action: 'SUBSCRIPTION_PAYMENT_INITIATED',
      entityType: 'SUBSCRIPTION_PAYMENT',
      entityId: orderId,
      context: {
        tierKey: requiredTier,
        amountInr: String(amountInr),
        activeStudents: String(activeStudentCount),
      },
    });

    return ok({
      orderId,
      paymentSessionId: cfResult.paymentSessionId,
      amountInr,
      currency: 'INR',
      tierKey: requiredTier,
      expiresAt: cfResult.orderExpiryTime,
    });
  }
}
