import { z } from 'zod';

export const academySettingsSchema = z.object({
  defaultDueDateDay: z.number().int().min(1).max(28),
  receiptPrefix: z.string().max(20),
  lateFeeEnabled: z.boolean(),
  gracePeriodDays: z.number().int().min(0).max(30),
  lateFeeAmountInr: z.number().int().min(0).max(10000),
  lateFeeRepeatIntervalDays: z.number().int(),
});
