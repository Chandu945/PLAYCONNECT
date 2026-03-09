import type { SubscriptionPayment } from '../entities/subscription-payment.entity';

export const SUBSCRIPTION_PAYMENT_REPOSITORY = Symbol('SUBSCRIPTION_PAYMENT_REPOSITORY');

export interface SubscriptionPaymentRepository {
  save(payment: SubscriptionPayment): Promise<void>;
  /**
   * Atomically transition a payment from expectedStatus to the new status.
   * Returns false if the document was not found with the expected status
   * (i.e. another request already transitioned it).
   */
  saveWithStatusPrecondition(
    payment: SubscriptionPayment,
    expectedStatus: string,
  ): Promise<boolean>;
  findByOrderId(orderId: string): Promise<SubscriptionPayment | null>;
  findPendingByAcademyId(academyId: string): Promise<SubscriptionPayment | null>;
}
