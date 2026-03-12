import { z } from 'zod';

export type FeeDueStatus = 'UPCOMING' | 'DUE' | 'PAID';
export type PaidSource = 'OWNER_DIRECT' | 'STAFF_APPROVED' | 'PARENT_ONLINE';
export type PaymentLabel = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'ONLINE';

export const childSummarySchema = z.object({
  studentId: z.string(),
  fullName: z.string(),
  status: z.string(),
  monthlyFee: z.number(),
  academyId: z.string(),
  currentMonthAttendancePercent: z.number().nullable(),
});

export const childrenListSchema = z.array(childSummarySchema);

export const childAttendanceSummarySchema = z.object({
  studentId: z.string(),
  month: z.string(),
  presentCount: z.number(),
  absentCount: z.number(),
  holidayCount: z.number(),
});

export const childFeeDueSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  monthKey: z.string(),
  dueDate: z.string(),
  amount: z.number(),
  lateFee: z.number().default(0),
  totalPayable: z.number().default(0),
  status: z.enum(['UPCOMING', 'DUE', 'PAID']),
  paidAt: z.string().nullable(),
  paidSource: z.enum(['OWNER_DIRECT', 'STAFF_APPROVED', 'PARENT_ONLINE']).nullable(),
  paymentLabel: z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'ONLINE']).nullable(),
});

export const childFeesListSchema = z.array(childFeeDueSchema);

export const initiateFeePaymentResponseSchema = z.object({
  orderId: z.string(),
  paymentSessionId: z.string(),
  baseAmount: z.number(),
  lateFee: z.number().default(0),
  convenienceFee: z.number(),
  totalAmount: z.number(),
  currency: z.string(),
});

export const feePaymentStatusResponseSchema = z.object({
  orderId: z.string(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']),
  baseAmount: z.number(),
  convenienceFee: z.number(),
  totalAmount: z.number(),
  providerPaymentId: z.string().nullable(),
  paidAt: z.string().nullable(),
});

export const receiptSchema = z.object({
  receiptNumber: z.string(),
  studentName: z.string(),
  academyName: z.string(),
  monthKey: z.string(),
  amount: z.number(),
  lateFeeApplied: z.number().nullable().default(null),
  paidAt: z.string(),
  paymentMethod: z.string(),
  source: z.enum(['OWNER_DIRECT', 'STAFF_APPROVED', 'PARENT_ONLINE']),
});

export const parentProfileSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phoneNumber: z.string(),
});

export const academyInfoSchema = z.object({
  academyName: z.string(),
  address: z.object({
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
    country: z.string(),
  }),
});

export const paymentHistoryItemSchema = z.object({
  feeDueId: z.string(),
  receiptNumber: z.string(),
  studentName: z.string(),
  monthKey: z.string(),
  amount: z.number(),
  source: z.enum(['OWNER_DIRECT', 'STAFF_APPROVED', 'PARENT_ONLINE']),
  paidAt: z.string(),
});

export const paymentHistoryListSchema = z.array(paymentHistoryItemSchema);
