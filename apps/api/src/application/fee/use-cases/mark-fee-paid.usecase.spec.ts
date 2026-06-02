import { MarkFeePaidUseCase } from './mark-fee-paid.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryFeeDueRepository,
  InMemoryTransactionLogRepository,
  InMemoryAcademyRepository,
  InMemoryPaymentRequestRepository,
} from '../../../../test/helpers/in-memory-repos';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import { Academy } from '@domain/academy/entities/academy.entity';
import { PaymentRequest } from '@domain/fee/entities/payment-request.entity';
import type { ClockPort } from '../../common/clock.port';
import type { TransactionPort } from '../../common/transaction.port';
import { ConcurrentModificationError } from '@shared/errors/concurrent-modification.error';

function createOwner(id = 'owner-1', academyId = 'academy-1'): User {
  const user = User.create({
    id,
    fullName: 'Test Owner',
    email: `${id}@test.com`,
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
  return User.reconstitute(id, { ...user['props'], academyId });
}

function createStaffUser(id = 'staff-1', academyId = 'academy-1'): User {
  const user = User.create({
    id,
    fullName: 'Test Staff',
    email: `${id}@test.com`,
    phoneNumber: '+919876543211',
    role: 'STAFF',
    passwordHash: 'hashed',
  });
  return User.reconstitute(id, { ...user['props'], academyId });
}

function createStudent(id: string, academyId: string): Student {
  return Student.create({
    id,
    academyId,
    fullName: 'Student',
    dateOfBirth: new Date('2010-01-01'),
    gender: 'MALE',
    address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
    guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
    joiningDate: new Date('2024-01-01'),
    monthlyFee: 500,
  });
}

function createFeeDue(academyId: string, studentId: string, monthKey = '2024-03'): FeeDue {
  const upcoming = FeeDue.create({
    id: `${studentId}-${monthKey}`,
    academyId,
    studentId,
    monthKey,
    dueDate: `${monthKey}-05`,
    amount: 500,
  });
  // Most tests exercise the DUE path; flip so the fixture reflects a fee
  // past its due date. (UPCOMING fees are also collectible — see the
  // early-payment test below.)
  return upcoming.flipToDue();
}

const fixedClock: ClockPort = {
  now: () => new Date('2024-03-10T10:00:00.000Z'),
};

const noopTransaction: TransactionPort = {
  run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
};

describe('MarkFeePaidUseCase', () => {
  let userRepo: InMemoryUserRepository;
  let studentRepo: InMemoryStudentRepository;
  let feeDueRepo: InMemoryFeeDueRepository;
  let transactionLogRepo: InMemoryTransactionLogRepository;
  let academyRepo: InMemoryAcademyRepository;
  let paymentRequestRepo: InMemoryPaymentRequestRepository;
  let auditRecorder: { record: jest.Mock };
  let pushService: { sendToUsers: jest.Mock };
  let useCase: MarkFeePaidUseCase;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    studentRepo = new InMemoryStudentRepository();
    feeDueRepo = new InMemoryFeeDueRepository();
    transactionLogRepo = new InMemoryTransactionLogRepository();
    academyRepo = new InMemoryAcademyRepository();
    paymentRequestRepo = new InMemoryPaymentRequestRepository();
    auditRecorder = { record: jest.fn().mockResolvedValue(undefined) };
    pushService = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
    useCase = new MarkFeePaidUseCase(
      userRepo,
      studentRepo,
      feeDueRepo,
      transactionLogRepo,
      academyRepo,
      fixedClock,
      noopTransaction,
      auditRecorder,
      // InMemoryPaymentRequestRepository doesn't implement the pre-existing
      // (unused-by-this-test) `listByAcademyAndStudent` method; cast through
      // unknown to side-step the structural-type complaint without polluting
      // the in-memory helper for unrelated tests.
      paymentRequestRepo as unknown as ConstructorParameters<typeof MarkFeePaidUseCase>[8],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pushService as any,
    );

    // Create academy
    const academy = Academy.create({
      id: 'academy-1',
      ownerUserId: 'owner-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'Mumbai', state: 'MH', pincode: '400001', country: 'India' },
    });
    await academyRepo.save(academy);
  });

  it('should mark a DUE fee as PAID and create transaction log', async () => {
    const owner = createOwner();
    await userRepo.save(owner);
    const student = createStudent('s1', 'academy-1');
    await studentRepo.save(student);
    const due = createFeeDue('academy-1', 's1');
    await feeDueRepo.save(due);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 's1',
      monthKey: '2024-03',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PAID');
      expect(result.value.paidByUserId).toBe('owner-1');
      expect(result.value.paidSource).toBe('OWNER_DIRECT');
      expect(result.value.paymentLabel).toBe('CASH');
    }
  });

  it('marks an UPCOMING fee as PAID (early payment, before the due date) with no late fee', async () => {
    // Regression for the production 500 "Cannot mark an UPCOMING fee as paid":
    // an owner must be able to collect a fee that is still UPCOMING (its due
    // date is a few days out). dueDate 2024-03-15 is in the future relative to
    // the fixed clock (2024-03-10), so no late fee applies.
    const owner = createOwner();
    await userRepo.save(owner);
    const student = createStudent('s1', 'academy-1');
    await studentRepo.save(student);
    const upcoming = FeeDue.create({
      id: 's1-2024-03',
      academyId: 'academy-1',
      studentId: 's1',
      monthKey: '2024-03',
      dueDate: '2024-03-15',
      amount: 500,
    });
    expect(upcoming.status).toBe('UPCOMING');
    await feeDueRepo.save(upcoming);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 's1',
      monthKey: '2024-03',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PAID');
      expect(result.value.paidSource).toBe('OWNER_DIRECT');
      expect(result.value.lateFee).toBe(0);
      expect(result.value.totalPayable).toBe(500);
    }
    // A transaction log recording the base amount only (no late fee) is written.
    const logs = await transactionLogRepo.listByStudentIds(['s1']);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.amount).toBe(500);
    expect(logs[0]!.lateFeeAmount).toBe(0);
  });

  it('M3: maps ConcurrentModificationError on FeeDue.save to a domain CONFLICT', async () => {
    // The race we're closing: between the in-memory PAID check at the top
    // of the use-case and the feeDueRepo.save inside the transaction, a
    // concurrent path (approve-payment-request, Cashfree webhook, cron
    // snapshot, or another mark-paid from a second device) bumped the fee
    // version. The save throws ConcurrentModificationError. Previously this
    // bubbled to the GlobalExceptionFilter and surfaced as a generic
    // 'ConcurrentModification' 409. With M3 the use-case maps it to a
    // domain-specific 'alreadyPaid()' CONFLICT.
    const owner = createOwner();
    await userRepo.save(owner);
    const student = createStudent('s1', 'academy-1');
    await studentRepo.save(student);
    const due = createFeeDue('academy-1', 's1');
    await feeDueRepo.save(due);

    jest.spyOn(feeDueRepo, 'save').mockRejectedValueOnce(new ConcurrentModificationError('FeeDue'));

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 's1',
      monthKey: '2024-03',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      // alreadyPaid() carries the stable "...already been paid" phrase.
      expect(result.error.message.toLowerCase()).toContain('already been paid');
    }
  });

  it('should reject already PAID due (409)', async () => {
    const owner = createOwner();
    await userRepo.save(owner);
    const student = createStudent('s1', 'academy-1');
    await studentRepo.save(student);
    const due = createFeeDue('academy-1', 's1');
    const paid = due.markPaid('owner-1', new Date());
    await feeDueRepo.save(paid);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 's1',
      monthKey: '2024-03',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject non-OWNER (403)', async () => {
    const staff = createStaffUser();
    await userRepo.save(staff);
    const student = createStudent('s1', 'academy-1');
    await studentRepo.save(student);
    const due = createFeeDue('academy-1', 's1');
    await feeDueRepo.save(due);

    const result = await useCase.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 's1',
      monthKey: '2024-03',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject cross-academy student (403)', async () => {
    const owner = createOwner('owner-1', 'academy-1');
    await userRepo.save(owner);
    const student = createStudent('s1', 'academy-2');
    await studentRepo.save(student);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 's1',
      monthKey: '2024-03',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  describe('M4: auto-resolve pending PaymentRequest when owner marks paid directly', () => {
    async function setupFeeWithPendingPR(source: 'PARENT' | 'STAFF' = 'PARENT') {
      const owner = createOwner();
      await userRepo.save(owner);
      const student = createStudent('s1', 'academy-1');
      await studentRepo.save(student);
      const due = createFeeDue('academy-1', 's1');
      await feeDueRepo.save(due);

      // staffUserId stores the parent's userId for PARENT-source PRs; for
      // STAFF source it's the staff member's id. The notification target
      // routes off of source, not the field name.
      const authorId = source === 'PARENT' ? 'parent-1' : 'staff-1';
      const pr = PaymentRequest.create({
        id: 'pr-1',
        academyId: 'academy-1',
        studentId: 's1',
        feeDueId: due.id.toString(),
        monthKey: '2024-03',
        amount: 500,
        staffUserId: authorId,
        staffNotes: 'submitted via app',
        source,
        proofImageUrl: source === 'PARENT' ? 'https://r2.example/proof.jpg' : null,
      });
      await paymentRequestRepo.save(pr);
      return pr;
    }

    it('cancels a pending PARENT-source PR after the fee is marked paid', async () => {
      const pr = await setupFeeWithPendingPR('PARENT');

      const result = await useCase.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 's1',
        monthKey: '2024-03',
      });

      expect(result.ok).toBe(true);
      const stored = await paymentRequestRepo.findById(pr.id.toString());
      expect(stored?.status).toBe('CANCELLED');
    });

    it('sends an auto-resolved push notification to the parent (PARENT source only)', async () => {
      await setupFeeWithPendingPR('PARENT');

      await useCase.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 's1',
        monthKey: '2024-03',
      });

      expect(pushService.sendToUsers).toHaveBeenCalledTimes(1);
      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        ['parent-1'],
        expect.objectContaining({
          title: 'Payment confirmed',
          data: expect.objectContaining({ type: 'MANUAL_PAYMENT_AUTO_RESOLVED' }),
        }),
      );
    });

    it('does NOT push for STAFF-source PRs (staff see queue updates in-app)', async () => {
      await setupFeeWithPendingPR('STAFF');

      await useCase.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 's1',
        monthKey: '2024-03',
      });

      expect(pushService.sendToUsers).not.toHaveBeenCalled();
    });

    it('records a PAYMENT_REQUEST_AUTO_RESOLVED audit entry when a PR is cleaned up', async () => {
      const pr = await setupFeeWithPendingPR('PARENT');

      await useCase.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 's1',
        monthKey: '2024-03',
      });

      // First audit is FEE_MARKED_PAID, second is the auto-resolution.
      const autoResolvedCall = auditRecorder.record.mock.calls.find(
        (c) => c[0].action === 'PAYMENT_REQUEST_AUTO_RESOLVED',
      );
      expect(autoResolvedCall).toBeDefined();
      expect(autoResolvedCall![0]).toEqual(
        expect.objectContaining({
          academyId: 'academy-1',
          actorUserId: 'owner-1',
          action: 'PAYMENT_REQUEST_AUTO_RESOLVED',
          entityType: 'PAYMENT_REQUEST',
          entityId: pr.id.toString(),
          context: expect.objectContaining({ source: 'PARENT' }),
        }),
      );
    });

    it('M2: cancels the PR INSIDE the same transaction as the fee save (atomicity)', async () => {
      // M2 (fee/payments audit) moved the PR auto-resolve inside the
      // transaction. Pre-fix: feeDueRepo.save committed first, then PR save
      // ran as a separate top-level call — a transient PR save error would
      // surface as a 500 AFTER fee was already PAID, leaving an orphan
      // PENDING PR and a confused parent. Post-fix: both saves happen inside
      // the same transaction.run() callback, so either both commit or
      // (under real Mongo) neither does. Side-effects (audit + push) stay
      // outside, which is the correct boundary.
      //
      // We can't directly assert "rolled back" against the in-memory repos
      // (no real transaction), so we assert call ORDER: every PR-touching
      // call must happen between tx-start and tx-end.
      await setupFeeWithPendingPR('PARENT');

      const events: string[] = [];
      const trackingTx = {
        run: async <T>(fn: () => Promise<T>): Promise<T> => {
          events.push('tx-start');
          try {
            const r = await fn();
            events.push('tx-end');
            return r;
          } catch (e) {
            events.push('tx-error');
            throw e;
          }
        },
      };

      const findSpy = jest.spyOn(paymentRequestRepo, 'findPendingByFeeDue');
      findSpy.mockImplementation(async (id) => {
        events.push('pr-find');
        const orig = InMemoryPaymentRequestRepository.prototype.findPendingByFeeDue;
        return orig.call(paymentRequestRepo, id);
      });
      const prSaveSpy = jest.spyOn(paymentRequestRepo, 'save');
      prSaveSpy.mockImplementation(async (pr) => {
        events.push('pr-save');
        const orig = InMemoryPaymentRequestRepository.prototype.save;
        return orig.call(paymentRequestRepo, pr);
      });
      const feeSaveSpy = jest.spyOn(feeDueRepo, 'save');
      feeSaveSpy.mockImplementation(async (d) => {
        events.push('fee-save');
        const orig = InMemoryFeeDueRepository.prototype.save;
        return orig.call(feeDueRepo, d);
      });

      const ucWithTrackingTx = new MarkFeePaidUseCase(
        userRepo,
        studentRepo,
        feeDueRepo,
        transactionLogRepo,
        academyRepo,
        fixedClock,
        trackingTx,
        auditRecorder,
        paymentRequestRepo as unknown as ConstructorParameters<typeof MarkFeePaidUseCase>[8],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pushService as any,
      );

      const result = await ucWithTrackingTx.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 's1',
        monthKey: '2024-03',
      });
      expect(result.ok).toBe(true);

      const txStart = events.indexOf('tx-start');
      const txEnd = events.indexOf('tx-end');
      const feeSaveIdx = events.indexOf('fee-save');
      const prFindIdx = events.indexOf('pr-find');
      const prSaveIdx = events.indexOf('pr-save');

      expect(txStart).toBeGreaterThanOrEqual(0);
      expect(txEnd).toBeGreaterThan(txStart);
      // All three writes must sit strictly between tx-start and tx-end.
      for (const idx of [feeSaveIdx, prFindIdx, prSaveIdx]) {
        expect(idx).toBeGreaterThan(txStart);
        expect(idx).toBeLessThan(txEnd);
      }
    });

    it('M2: maps a CMC error on PR save to a domain CONFLICT (not a 500)', async () => {
      // The other side of M2 atomicity: under real Mongo, a CMC during the
      // PR cancel means a concurrent path already mutated the PR (e.g. an
      // approve-payment-request that beat us by a hair). The transaction
      // rolls back the fee save, and the use-case's outer catch maps the
      // CMC to `alreadyPaid()` CONFLICT — same shape callers see for any
      // other race. Without M2, this would have bubbled as an uncaught
      // CMC error post-fee-commit.
      await setupFeeWithPendingPR('PARENT');

      jest
        .spyOn(paymentRequestRepo, 'save')
        .mockRejectedValueOnce(new ConcurrentModificationError('PaymentRequest'));

      const result = await useCase.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 's1',
        monthKey: '2024-03',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CONFLICT');
      }
    });

    it('is a no-op when no pending PR exists for the fee (regular mark-paid)', async () => {
      const owner = createOwner();
      await userRepo.save(owner);
      const student = createStudent('s1', 'academy-1');
      await studentRepo.save(student);
      const due = createFeeDue('academy-1', 's1');
      await feeDueRepo.save(due);

      const result = await useCase.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 's1',
        monthKey: '2024-03',
      });

      expect(result.ok).toBe(true);
      expect(pushService.sendToUsers).not.toHaveBeenCalled();
      // Only FEE_MARKED_PAID, no PAYMENT_REQUEST_AUTO_RESOLVED.
      const calls = auditRecorder.record.mock.calls.map((c) => c[0].action);
      expect(calls).toContain('FEE_MARKED_PAID');
      expect(calls).not.toContain('PAYMENT_REQUEST_AUTO_RESOLVED');
    });
  });
});
