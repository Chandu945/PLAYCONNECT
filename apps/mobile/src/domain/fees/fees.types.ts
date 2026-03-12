export type MonthKey = string; // YYYY-MM

export type FeeDueStatus = 'UPCOMING' | 'DUE' | 'PAID';
export type PaidSource = 'OWNER_DIRECT' | 'STAFF_APPROVED' | 'PARENT_ONLINE';
export type PaymentLabel = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'ONLINE';

export type FeeDueItem = {
  id: string;
  academyId: string;
  studentId: string;
  monthKey: string;
  dueDate: string;
  amount: number;
  lateFee: number;
  totalPayable: number;
  status: FeeDueStatus;
  paidAt: string | null;
  paidByUserId: string | null;
  paidSource: PaidSource | null;
  paymentLabel: PaymentLabel | null;
  collectedByUserId: string | null;
  approvedByUserId: string | null;
  paymentRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};
