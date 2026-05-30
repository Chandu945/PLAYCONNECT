import { z } from 'zod';

const tierKeySchema = z.enum(['TIER_0_50', 'TIER_51_100', 'TIER_101_PLUS']);
const subscriptionStatusSchema = z.enum([
  'TRIAL',
  'ACTIVE_PAID',
  'EXPIRED_GRACE',
  'BLOCKED',
  'DISABLED',
]);

export const initiatePaymentResponseSchema = z.object({
  orderId: z.string().min(1),
  paymentSessionId: z.string().min(1),
  amountInr: z.number().int().positive(),
  currency: z.string(),
  tierKey: tierKeySchema,
  expiresAt: z.string(),
});

export const paymentStatusResponseSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED']),
  tierKey: tierKeySchema,
  amountInr: z.number().int().positive(),
  providerPaymentId: z.string().nullable(),
  paidAt: z.string().nullable(),
  subscription: z.object({
    status: subscriptionStatusSchema,
    paidStartAt: z.string().nullable(),
    paidEndAt: z.string().nullable(),
  }),
});

export const tierPricingSchema = z.object({
  tierKey: tierKeySchema,
  min: z.number().int().min(0),
  max: z.number().int().nullable(),
  priceInr: z.number().int().positive(),
});

export const pendingTierChangeSchema = z.object({
  tierKey: tierKeySchema,
  effectiveAt: z.string(),
});

export const subscriptionInfoSchema = z.object({
  status: subscriptionStatusSchema,
  trialEndAt: z.string(),
  paidEndAt: z.string().nullable(),
  tierKey: tierKeySchema.nullable(),
  daysRemaining: z.number().int(),
  canAccessApp: z.boolean(),
  blockReason: z.string().nullable(),
  activeStudentCount: z.number().int().min(0),
  peakStudentCount: z.number().int().min(0).optional(),
  studentsInGraceWindow: z.number().int().min(0).optional(),
  projectedTierKey: tierKeySchema.optional(),
  currentTierKey: tierKeySchema.nullable(),
  requiredTierKey: tierKeySchema,
  pendingTierChange: pendingTierChangeSchema.nullable(),
  tiers: z.array(tierPricingSchema),
  // Server-authoritative PENDING Cashfree order id; the screen uses it to resume
  // polling after an app kill / network drop mid-checkout. Without this key Zod
  // strips the field and resume-after-kill silently never fires. Optional so a
  // lagging API still parses (consumers treat a missing value as null).
  pendingPaymentOrderId: z.string().nullable().optional(),
});
