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

    // Check for existing PENDING payment — expire stale ones
    const existingPending = await this.paymentRepo.findPendingByAcademyId(academyId);
    if (existingPending) {
      const STALE_PAYMENT_TTL_MS = 30 * 60 * 1000; // 30 minutes
      const now = this.clock.now();
      const createdAt = existingPending.audit.createdAt;
      if (now.getTime() - createdAt.getTime() > STALE_PAYMENT_TTL_MS) {
        // Stale PENDING payment — mark as FAILED so a new one can proceed
        const expired = existingPending.markFailed('EXPIRED_STALE');
        await this.paymentRepo.save(expired);
        this.logger.info('Expired stale PENDING payment', {
          academyId,
          orderId: existingPending.orderId,
        });
      } else {
        return err(AppError.conflict('A payment is already in progress for this academy'));
      }
    }

    // Load subscription
    const subscription = await this.subscriptionRepo.findByAcademyId(academyId);
    if (!subscription) {
      return err(AppError.notFound('Subscription'));
    }

    // Compute tier + amount
    const now = this.clock.now();
    const activeStudentCount = await this.studentCounter.countActiveStudents(academyId, now);
    const requiredTier = requiredTierForCount(activeStudentCount);
    const amountInr = priceForTier(requiredTier);

    // Create order id and persist PENDING payment record BEFORE calling Cashfree
    const orderId = generateOrderId();
    const idempotencyKey = randomUUID();

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
    await this.paymentRepo.save(payment);

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
      const failed = payment.markFailed('CASHFREE_CREATE_ORDER_FAILED');
      await this.paymentRepo.save(failed);
      return err(new AppError('PAYMENT_PROVIDER_UNAVAILABLE', 'Payment provider is temporarily unavailable. Please try again.'));
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
