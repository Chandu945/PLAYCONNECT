import type { FeeDueStatus, PaidSource, PaymentLabel } from '@playconnect/contracts';

export interface ChildSummaryDto {
  studentId: string;
  fullName: string;
  status: string;
  monthlyFee: number;
  academyId: string;
  currentMonthAttendancePercent: number | null;
}

export interface ParentProfileDto {
  fullName: string;
  email: string;
  phoneNumber: string;
}

export interface AcademyInfoDto {
  academyName: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
}

export interface PaymentHistoryItemDto {
  feeDueId: string;
  receiptNumber: string;
  studentName: string;
  monthKey: string;
  amount: number;
  source: PaidSource;
  paidAt: string;
}

export interface ChildAttendanceSummaryDto {
  studentId: string;
  month: string;
  presentCount: number;
  absentCount: number;
  holidayCount: number;
}

export interface ChildFeeDueDto {
  id: string;
  studentId: string;
  monthKey: string;
  dueDate: string;
  amount: number;
  lateFee: number;
  totalPayable: number;
  status: FeeDueStatus;
  paidAt: string | null;
  paidSource: PaidSource | null;
  paymentLabel: PaymentLabel | null;
}

export interface InitiateFeePaymentOutput {
  orderId: string;
  paymentSessionId: string;
  baseAmount: number;
  lateFee: number;
  convenienceFee: number;
  totalAmount: number;
  currency: string;
}

export interface FeePaymentStatusOutput {
  orderId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  baseAmount: number;
  convenienceFee: number;
  totalAmount: number;
  providerPaymentId: string | null;
  paidAt: string | null;
}

export interface ReceiptOutput {
  receiptNumber: string;
  studentName: string;
  academyName: string;
  monthKey: string;
  amount: number;
  lateFeeApplied: number | null;
  paidAt: string;
  paymentMethod: string;
  source: PaidSource;
}
