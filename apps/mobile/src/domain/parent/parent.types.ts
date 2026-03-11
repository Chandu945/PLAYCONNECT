import type { FeeDueStatus, PaidSource, PaymentLabel } from './parent.schemas';

export type ChildSummary = {
  studentId: string;
  fullName: string;
  status: string;
  monthlyFee: number;
  academyId: string;
  currentMonthAttendancePercent: number | null;
};

export type ChildAttendanceSummary = {
  studentId: string;
  month: string;
  presentCount: number;
  absentCount: number;
  holidayCount: number;
};

export type ChildFeeDue = {
  id: string;
  studentId: string;
  monthKey: string;
  dueDate: string;
  amount: number;
  status: FeeDueStatus;
  paidAt: string | null;
  paidSource: PaidSource | null;
  paymentLabel: PaymentLabel | null;
};

export type FeePaymentFlowStatus =
  | 'idle'
  | 'initiating'
  | 'checkout'
  | 'polling'
  | 'success'
  | 'failed';

export type InitiateFeePaymentResponse = {
  orderId: string;
  paymentSessionId: string;
  baseAmount: number;
  convenienceFee: number;
  totalAmount: number;
  currency: string;
};

export type FeePaymentStatusResponse = {
  orderId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  baseAmount: number;
  convenienceFee: number;
  totalAmount: number;
  providerPaymentId: string | null;
  paidAt: string | null;
};

export type ReceiptInfo = {
  receiptNumber: string;
  studentName: string;
  academyName: string;
  monthKey: string;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  source: PaidSource;
};

export type ParentProfile = {
  fullName: string;
  email: string;
  phoneNumber: string;
};

export type UpdateProfileRequest = {
  fullName?: string;
  phoneNumber?: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type AcademyInfo = {
  academyName: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
};

export type PaymentHistoryItem = {
  feeDueId: string;
  receiptNumber: string;
  studentName: string;
  monthKey: string;
  amount: number;
  source: PaidSource;
  paidAt: string;
};
