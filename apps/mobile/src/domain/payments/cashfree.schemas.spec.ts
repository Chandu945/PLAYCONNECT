import { subscriptionInfoSchema } from './cashfree.schemas';

// Minimal valid SubscriptionInfo payload (all required fields).
const base = {
  status: 'TRIAL',
  trialEndAt: '2026-06-01',
  paidEndAt: null,
  tierKey: null,
  daysRemaining: 10,
  canAccessApp: true,
  blockReason: null,
  activeStudentCount: 30,
  currentTierKey: null,
  requiredTierKey: 'TIER_0_50',
  pendingTierChange: null,
  tiers: [],
};

describe('subscriptionInfoSchema — preserves pendingPaymentOrderId (resume-after-kill)', () => {
  it('keeps the pendingPaymentOrderId instead of stripping it', () => {
    const parsed = subscriptionInfoSchema.parse({ ...base, pendingPaymentOrderId: 'order-123' });
    // Before the fix Zod stripped this unknown key -> undefined, killing resume.
    expect(parsed.pendingPaymentOrderId).toBe('order-123');
  });

  it('accepts a null pendingPaymentOrderId', () => {
    const parsed = subscriptionInfoSchema.parse({ ...base, pendingPaymentOrderId: null });
    expect(parsed.pendingPaymentOrderId).toBeNull();
  });

  it('still parses when a lagging API omits the field', () => {
    const parsed = subscriptionInfoSchema.parse(base);
    expect(parsed.pendingPaymentOrderId).toBeUndefined();
  });
});
