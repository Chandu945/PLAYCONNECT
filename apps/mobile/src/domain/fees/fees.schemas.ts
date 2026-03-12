import { z } from 'zod';

export const feeDueItemSchema = z.object({
  id: z.string(),
  academyId: z.string(),
  studentId: z.string(),
  monthKey: z.string(),
  dueDate: z.string(),
  amount: z.number().int(),
  lateFee: z.number().int().default(0),
  totalPayable: z.number().int().default(0),
  status: z.enum(['UPCOMING', 'DUE', 'PAID']),
  paidAt: z.string().nullable(),
  paidByUserId: z.string().nullable(),
  paidSource: z.enum(['OWNER_DIRECT', 'STAFF_APPROVED', 'PARENT_ONLINE']).nullable(),
  paymentLabel: z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'ONLINE']).nullable(),
  collectedByUserId: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  paymentRequestId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const feeDueListResponseSchema = z.array(feeDueItemSchema);

export type FeeDueListApiResponse = z.infer<typeof feeDueListResponseSchema>;
