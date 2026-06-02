import { FeeDue } from './fee-due.entity';
import type { LateFeeConfig } from '@academyflo/contracts';

describe('FeeDue', () => {
  function makeDue() {
    return FeeDue.create({
      id: 'due-1',
      academyId: 'academy-1',
      studentId: 's1',
      monthKey: '2024-03',
      dueDate: '2024-03-05',
      amount: 500,
    });
  }

  const snapshot: LateFeeConfig = {
    lateFeeEnabled: true,
    gracePeriodDays: 5,
    lateFeeAmountInr: 100,
    lateFeeRepeatIntervalDays: 5,
  };

  describe('revertToDue', () => {
    it('preserves lateFeeConfigSnapshot (H1 invariant)', () => {
      // H1: the snapshot represents the rate that was locked when the fee
      // first became DUE. Reverting from PAID back to DUE doesn't invalidate
      // that lock — the fee is still the same fee, the rate is still the
      // rate that applied. If we nulled it here, the cron's legacy-backfill
      // loop would re-snapshot using the current live config and silently
      // retroactively re-price the fee.
      const due = makeDue().flipToDue().snapshotLateFeeConfig(snapshot);
      expect(due.lateFeeConfigSnapshot).toEqual(snapshot);

      const paid = due.markPaid('owner-1', new Date('2024-03-12T00:00:00Z'));
      expect(paid.status).toBe('PAID');

      const reverted = paid.revertToDue();
      expect(reverted.status).toBe('DUE');
      // The snapshot survives the round-trip.
      expect(reverted.lateFeeConfigSnapshot).toEqual(snapshot);
    });

    it('clears paid-fields on revert', () => {
      // Defense in depth: the other revert fields still get reset so a
      // future "refund" caller gets a clean DUE record (no stale paidAt,
      // paidByUserId, etc. clinging to it).
      const paid = makeDue().flipToDue().markPaid('owner-1', new Date('2024-03-12T00:00:00Z'));

      const reverted = paid.revertToDue();
      expect(reverted.status).toBe('DUE');
      expect(reverted.paidAt).toBeNull();
      expect(reverted.paidByUserId).toBeNull();
      expect(reverted.paidSource).toBeNull();
      expect(reverted.paymentLabel).toBeNull();
      expect(reverted.collectedByUserId).toBeNull();
      expect(reverted.approvedByUserId).toBeNull();
      expect(reverted.paymentRequestId).toBeNull();
      expect(reverted.lateFeeApplied).toBeNull();
    });
  });

  describe('mark-paid status guard (PAID is terminal; UPCOMING/DUE collectible)', () => {
    const paidAt = new Date('2024-03-02T00:00:00Z');

    it('marks an UPCOMING fee paid (early / advance payment before the due date)', () => {
      // The reported bug: a fee still UPCOMING ("Due in 3 days") must be
      // collectible. No late fee applies before the due date, so callers pass 0.
      const due = makeDue();
      expect(due.status).toBe('UPCOMING');

      const paid = due.markPaid('owner-1', paidAt, 'CASH', 0);

      expect(paid.status).toBe('PAID');
      expect(paid.paidSource).toBe('OWNER_DIRECT');
      expect(paid.lateFeeApplied).toBe(0);
    });

    it('marks a DUE fee paid (unchanged behavior)', () => {
      const paid = makeDue().flipToDue().markPaid('owner-1', paidAt);
      expect(paid.status).toBe('PAID');
    });

    it('rejects re-paying an already-PAID fee (idempotency backstop)', () => {
      const paid = makeDue().markPaid('owner-1', paidAt, 'CASH', 0);
      expect(() => paid.markPaid('owner-2', paidAt)).toThrow('Fee is already paid');
    });

    it('allows markPaidByApproval on an UPCOMING fee and rejects it on a PAID fee', () => {
      const approvalParams = {
        approvedByUserId: 'owner-1',
        collectedByUserId: 'staff-1',
        paymentRequestId: 'pr-1',
        paidAt,
        lateFeeApplied: 0,
      };
      const approved = makeDue().markPaidByApproval(approvalParams);
      expect(approved.status).toBe('PAID');
      expect(approved.paidSource).toBe('STAFF_APPROVED');

      expect(() => approved.markPaidByApproval(approvalParams)).toThrow('Fee is already paid');
    });

    it('allows markPaidByParentOnline on an UPCOMING fee and rejects it on a PAID fee', () => {
      const online = makeDue().markPaidByParentOnline('parent-1', paidAt, 0);
      expect(online.status).toBe('PAID');
      expect(online.paidSource).toBe('PARENT_ONLINE');

      expect(() => online.markPaidByParentOnline('parent-1', paidAt)).toThrow('Fee is already paid');
    });
  });
});
