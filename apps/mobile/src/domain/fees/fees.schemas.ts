import { z } from 'zod';

export const feeDueItemSchema = z.object({
  id: z.string(),
  academyId: z.string(),
  studentId: z.string(),
  studentName: z.string().nullable().optional().default(null),
  monthKey: z.string(),
  dueDate: z.string(),
  amount: z.number().int(),
  lateFee: z.number().int().default(0),
  totalPayable: z.number().int().default(0),
  status: z.enum(['UPCOMING', 'DUE', 'PAID']),
  paidAt: z.string().nullable(),
  paidByUserId: z.string().nullable(),
  paidSource: z.enum(['OWNER_DIRECT', 'STAFF_APPROVED', 'PARENT_ONLINE', 'MANUAL']).nullable(),
  paymentLabel: z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'ONLINE']).nullable(),
  collectedByUserId: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  paymentRequestId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Unpaid-dues list only; older API responses / other surfaces omit these.
  studentPhone: z.string().nullable().optional(),
  unpaidMonthsCount: z.number().int().optional(),
});

export const feeDueListResponseSchema = z.array(feeDueItemSchema);

export type FeeDueListApiResponse = z.infer<typeof feeDueListResponseSchema>;

export const feeDuePaginatedResponseSchema = z.object({
  items: z.array(feeDueItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type FeeDuePaginatedApiResponse = z.infer<typeof feeDuePaginatedResponseSchema>;
