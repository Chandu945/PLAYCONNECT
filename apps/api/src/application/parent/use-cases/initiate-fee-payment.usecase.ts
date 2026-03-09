import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { FeePaymentRepository } from '@domain/parent/ports/fee-payment.repository';
import type { CashfreeGatewayPort } from '@domain/subscription-payments/ports/cashfree-gateway.port';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { LoggerPort } from '@shared/logging/logger.port';
import { canPayFeeOnline } from '@domain/parent/rules/parent.rules';
import { generateFeeOrderId } from '@domain/parent/rules/parent.rules';
import { FeePayment } from '@domain/parent/entities/fee-payment.entity';
import { ParentErrors } from '../../common/errors';
import type { InitiateFeePaymentOutput } from '../dtos/parent.dto';
import type { UserRole } from '@playconnect/contracts';
import { randomUUID } from 'node:crypto';

export interface InitiateFeePaymentInput {
  parentUserId: string;
  parentRole: UserRole;
  feeDueId: string;
}

export class InitiateFeePaymentUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly linkRepo: ParentStudentLinkRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly feePaymentRepo: FeePaymentRepository,
    private readonly cashfreeGateway: CashfreeGatewayPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(
    input: InitiateFeePaymentInput,
  ): Promise<Result<InitiateFeePaymentOutput, AppError>> {
    const check = canPayFeeOnline(input.parentRole);
    if (!check.allowed) return err(ParentErrors.payNotAllowed());

    const user = await this.userRepo.findById(input.parentUserId);
    if (!user) return err(ParentErrors.parentNotFound(input.parentUserId));

    // Load fee due by ID directly
    const foundDue = await this.feeDueRepo.findById(input.feeDueId);
    if (!foundDue) return err(ParentErrors.feeDueNotFound(input.feeDueId));

    // Verify parent has a link to this student
    const links = await this.linkRepo.findByParentUserId(input.parentUserId);
    if (links.length === 0) return err(ParentErrors.childNotLinked());

    const matchedLink = links.find(
      (l) => l.academyId === foundDue.academyId && l.studentId === foundDue.studentId,
    );
    if (!matchedLink) return err(ParentErrors.feeDueNotFound(input.feeDueId));
    if (foundDue.status === 'PAID') return err(ParentErrors.feeDueAlreadyPaid());

    // Check for existing pending payment
    const existingPending = await this.feePaymentRepo.findPendingByFeeDueId(input.feeDueId);
    if (existingPending) return err(ParentErrors.paymentAlreadyPending());

    // Create order id and persist PENDING payment record BEFORE calling Cashfree
    const orderId = generateFeeOrderId();
    const idempotencyKey = randomUUID();

    const payment = FeePayment.create({
      id: randomUUID(),
      academyId: matchedLink.academyId,
      parentUserId: input.parentUserId,
      studentId: matchedLink.studentId,
      feeDueId: input.feeDueId,
      monthKey: foundDue.monthKey,
      orderId,
      paymentSessionId: '',
      amount: foundDue.amount,
    });
    await this.feePaymentRepo.save(payment);

    // Call Cashfree API
    let cfResult;
    try {
      cfResult = await this.cashfreeGateway.createOrder({
        orderId,
        orderAmount: foundDue.amount,
        orderCurrency: 'INR',
        customerId: input.parentUserId,
        customerPhone: user.phoneE164,
        idempotencyKey,
      });
    } catch (error) {
      this.logger.error('Cashfree createOrder failed for fee payment', {
        feeDueId: input.feeDueId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      const failed = payment.markFailed('CASHFREE_CREATE_ORDER_FAILED');
      await this.feePaymentRepo.save(failed);
      return err(ParentErrors.paymentProviderUnavailable());
    }

    // Update payment with Cashfree details
    const withCfId = payment.setCfOrderId(cfResult.cfOrderId);
    const withCfDetails = FeePayment.reconstitute(withCfId.id.toString(), {
      academyId: withCfId.academyId,
      parentUserId: withCfId.parentUserId,
      studentId: withCfId.studentId,
      feeDueId: withCfId.feeDueId,
      monthKey: withCfId.monthKey,
      orderId: withCfId.orderId,
      cfOrderId: withCfId.cfOrderId,
      paymentSessionId: cfResult.paymentSessionId,
      amount: withCfId.amount,
      currency: withCfId.currency,
      status: withCfId.status,
      failureReason: withCfId.failureReason,
      paidAt: withCfId.paidAt,
      providerPaymentId: withCfId.providerPaymentId,
      audit: withCfId.audit,
    });
    await this.feePaymentRepo.save(withCfDetails);

    this.logger.info('Fee payment initiated', {
      feeDueId: input.feeDueId,
      orderId,
      amount: foundDue.amount,
    });

    return ok({
      orderId,
      paymentSessionId: cfResult.paymentSessionId,
      amount: foundDue.amount,
      currency: 'INR',
    });
  }
}
