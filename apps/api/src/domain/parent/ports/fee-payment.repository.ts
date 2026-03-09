import type { FeePayment } from '../entities/fee-payment.entity';

export const FEE_PAYMENT_REPOSITORY = Symbol('FEE_PAYMENT_REPOSITORY');

export interface FeePaymentRepository {
  save(payment: FeePayment): Promise<void>;
  /**
   * Atomically transition a payment from expectedStatus to the new status.
   * Returns false if the document was not found with the expected status
   * (i.e. another request already transitioned it).
   */
  saveWithStatusPrecondition(
    payment: FeePayment,
    expectedStatus: string,
  ): Promise<boolean>;
  findByOrderId(orderId: string): Promise<FeePayment | null>;
  findPendingByFeeDueId(feeDueId: string): Promise<FeePayment | null>;
  findByParentAndAcademy(parentUserId: string, academyId: string): Promise<FeePayment[]>;
}
