import { ApprovePaymentRequestUseCase } from './approve-payment-request.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '@domain/fee/ports/payment-request.repository';
import type { TransactionLogRepository } from '@domain/fee/ports/transaction-log.repository';
import type { ClockPort } from '../../common/clock.port';
import type { TransactionPort } from '../../common/transaction.port';
import type { AuditLogRepository } from '@domain/audit/ports/audit-log.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import { PaymentRequest } from '@domain/fee/entities/payment-request.entity';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import { User } from '@domain/identity/entities/user.entity';
import { Academy } from '@domain/academy/entities/academy.entity';
import { ConcurrentModificationError } from '@shared/errors/concurrent-modification.error';

describe('ApprovePaymentRequestUseCase', () => {
  let useCase: ApprovePaymentRequestUseCase;
  let userRepo: jest.Mocked<UserRepository>;
  let academyRepo: jest.Mocked<AcademyRepository>;
  let feeDueRepo: jest.Mocked<FeeDueRepository>;
  let prRepo: jest.Mocked<PaymentRequestRepository>;
  let txLogRepo: jest.Mocked<TransactionLogRepository>;
  let studentRepo: jest.Mocked<StudentRepository>;
  let clock: ClockPort;
  let tx: TransactionPort;
  let auditLogRepo: jest.Mocked<AuditLogRepository>;

  const fixedNow = new Date('2024-03-10T10:00:00.000Z');

  beforeEach(() => {
    userRepo = {
      findById: jest.fn(),
      findByIds: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      save: jest.fn(),
      updateAcademyId: jest.fn(),
      listByAcademyAndRole: jest.fn(),
      countActiveByAcademyAndRole: jest.fn().mockResolvedValue(0),
      incrementTokenVersionByAcademyId: jest.fn(),
      incrementTokenVersionByUserId: jest.fn(),
      listByAcademyId: jest.fn(),
      anonymizeAndSoftDelete: jest.fn(),
      listParentIdsByAcademy: jest.fn().mockResolvedValue([]),
    } as jest.Mocked<UserRepository>;

    academyRepo = {
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      save: jest.fn(),
      findAllIds: jest.fn(),
      saveWithVersionPrecondition: jest.fn(),
    } as jest.Mocked<AcademyRepository>;

    feeDueRepo = {
      save: jest.fn(),
      bulkSave: jest.fn(),
      bulkUpdateStatus: jest.fn(),
      findById: jest.fn(),
      findByAcademyStudentMonth: jest.fn(),
      listByAcademyMonthAndStatuses: jest.fn(),
      listByAcademyMonthPaid: jest.fn(),
      listByStudentAndRange: jest.fn(),
      listUpcomingByAcademyAndMonth: jest.fn(),
      listByAcademyAndMonth: jest.fn(),
      listUnpaidByAcademy: jest.fn(),
      sumUnpaidAmountByAcademy: jest.fn(),
      countDistinctUnpaidStudentsByAcademyAndMonth: jest.fn(),
      findUnpaidByDueDate: jest.fn(),
      findOverdueDues: jest.fn(),
      findDueWithoutSnapshot: jest.fn(),
      deleteUpcomingByStudent: jest.fn(),
      sumLateFeeCollectedByAcademyAndMonth: jest.fn(),
      sumLateFeeCollectedByAcademyAndDateRange: jest.fn(),
      sumUnpaidAmountByAcademyAndMonth: jest.fn(),
      countOverdueByAcademy: jest.fn(),
      listOverdueByAcademy: jest.fn(),
      saveSnapshotIfStillDue: jest.fn(),
    } as jest.Mocked<FeeDueRepository>;

    prRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findPendingByFeeDue: jest.fn(),
      listByAcademyAndStatuses: jest.fn(),
      listByStaffAndAcademy: jest.fn(),
      countPendingByStaffAndAcademy: jest.fn(),
      countPendingByAcademy: jest.fn(),
      countPendingByAuthorAndAcademySince: jest.fn(),
      listByAcademyAndStudent: jest.fn(),
      listPendingByStudentAndAcademy: jest.fn(),
      deleteAllByAcademyAndStudent: jest.fn(),
      deletePendingByAcademyAndStudent: jest.fn(),
    cancelPendingByStaffAndAcademy: jest.fn().mockResolvedValue(0),
    } as jest.Mocked<PaymentRequestRepository>;

    txLogRepo = {
      save: jest.fn(),
      findByPaymentRequestId: jest.fn(),
      listByAcademy: jest.fn(),
      countByAcademyAndPrefix: jest.fn(),
      incrementReceiptCounter: jest.fn(),
      sumRevenueByAcademyAndDateRange: jest.fn(),
      listByAcademyAndDateRange: jest.fn(),
      findByFeeDueId: jest.fn(),
      listByStudentIds: jest.fn(),
      sumRevenueByAcademyGroupedByMonth: jest.fn(),
    } as jest.Mocked<TransactionLogRepository>;

    studentRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByEmailInAcademy: jest.fn(),
      findByPhoneInAcademy: jest.fn(),
      list: jest.fn(),
      listActiveByAcademy: jest.fn(),
      countActiveByAcademy: jest.fn(),
    countScheduledStudentsByAcademyAndDate: jest.fn().mockResolvedValue(0),
      findByIds: jest.fn(),
      countInactiveByAcademy: jest.fn(),
      countNewAdmissionsByAcademyAndDateRange: jest.fn(),
      saveWithVersionPrecondition: jest.fn().mockResolvedValue(true),
      findBirthdaysByAcademy: jest.fn(),
    } as jest.Mocked<StudentRepository>;

    clock = { now: () => fixedNow };
    tx = { run: jest.fn().mockImplementation((fn) => fn()) };

    auditLogRepo = {
      save: jest.fn(),
      listByAcademy: jest.fn(),
      existsForBatchDate: jest.fn(),
    } as jest.Mocked<AuditLogRepository>;

    useCase = new ApprovePaymentRequestUseCase(
      userRepo,
      academyRepo,
      feeDueRepo,
      prRepo,
      txLogRepo,
      studentRepo,
      clock,
      tx,
      auditLogRepo,
    );
  });

  function makeOwner() {
    const user = User.create({
      id: 'owner-1',
      fullName: 'Owner',
      email: 'owner@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      passwordHash: 'hashed',
    });
    return User.reconstitute('owner-1', { ...user['props'], academyId: 'academy-1' });
  }

  function makeAcademy() {
    return Academy.create({
      id: 'academy-1',
      ownerUserId: 'owner-1',
      academyName: 'Test Academy',
      address: { line1: '1 St', city: 'A', state: 'B', pincode: '500001', country: 'India' },
    });
  }

  function makeFeeDue() {
    const due = FeeDue.create({
      id: 'due-1',
      academyId: 'academy-1',
      studentId: 's1',
      monthKey: '2024-03',
      dueDate: '2024-03-05',
      amount: 500,
    });
    return FeeDue.reconstitute('due-1', { ...due['props'], status: 'DUE' });
  }

  function makePendingRequest() {
    return PaymentRequest.create({
      id: 'pr-1',
      academyId: 'academy-1',
      studentId: 's1',
      feeDueId: 'due-1',
      monthKey: '2024-03',
      amount: 500,
      staffUserId: 'staff-1',
      staffNotes: 'Collected from parent',
    });
  }

  it('should approve a pending request and mark due as paid', async () => {
    userRepo.findById.mockResolvedValue(makeOwner());
    prRepo.findById.mockResolvedValue(makePendingRequest());
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(makeFeeDue());
    academyRepo.findById.mockResolvedValue(makeAcademy());
    txLogRepo.countByAcademyAndPrefix.mockResolvedValue(0);
    txLogRepo.incrementReceiptCounter.mockResolvedValue(1);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      requestId: 'pr-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('APPROVED');
      expect(result.value.reviewedByUserId).toBe('owner-1');
    }
    expect(prRepo.save).toHaveBeenCalled();
    expect(feeDueRepo.save).toHaveBeenCalled();
    expect(txLogRepo.save).toHaveBeenCalled();
    expect(tx.run).toHaveBeenCalled();
  });

  it('should reject non-OWNER role', async () => {
    const result = await useCase.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      requestId: 'pr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject if request is not PENDING', async () => {
    userRepo.findById.mockResolvedValue(makeOwner());
    const approved = makePendingRequest().approve('owner-1', fixedNow);
    prRepo.findById.mockResolvedValue(approved);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      requestId: 'pr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject if due is already PAID', async () => {
    userRepo.findById.mockResolvedValue(makeOwner());
    prRepo.findById.mockResolvedValue(makePendingRequest());
    const paidDue = makeFeeDue().markPaid('owner-1', fixedNow);
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(paidDue);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      requestId: 'pr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject approving a request for less than the amount due (underpayment)', async () => {
    // Realistic trigger: the request was created for ₹500, then the fee
    // amount was raised to ₹800 before approval. Approving must NOT silently
    // close the ₹800 fee while only ₹500 was collected.
    userRepo.findById.mockResolvedValue(makeOwner());
    prRepo.findById.mockResolvedValue(makePendingRequest()); // amount 500
    const higherDue = FeeDue.reconstitute('due-1', { ...makeFeeDue()['props'], amount: 800 });
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(higherDue);
    academyRepo.findById.mockResolvedValue(makeAcademy());

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      requestId: 'pr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.message).toContain('less than the fee due');
    }
    // The fee must not be marked paid and no ledger row may be written.
    expect(feeDueRepo.save).not.toHaveBeenCalled();
    expect(txLogRepo.save).not.toHaveBeenCalled();
  });

  it('still approves an exact-amount request (boundary: request.amount === due.amount)', async () => {
    // Guard is strictly `<` — paying exactly the amount due is valid.
    userRepo.findById.mockResolvedValue(makeOwner());
    prRepo.findById.mockResolvedValue(makePendingRequest()); // amount 500
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(makeFeeDue()); // amount 500
    academyRepo.findById.mockResolvedValue(makeAcademy());
    txLogRepo.incrementReceiptCounter.mockResolvedValue(1);

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      requestId: 'pr-1',
    });

    expect(result.ok).toBe(true);
    expect(feeDueRepo.save).toHaveBeenCalled();
  });

  it('M2: maps ConcurrentModificationError on FeeDue.save to a domain CONFLICT', async () => {
    // The race we're closing: the in-transaction PR-status pre-check passed
    // (so we're not hitting ConcurrentApprovalError), but somewhere between
    // load and write a concurrent path (direct mark-paid, Cashfree webhook,
    // cron snapshot, etc.) bumped the FeeDue version. feeDueRepo.save throws
    // ConcurrentModificationError. Previously this bubbled to the
    // GlobalExceptionFilter and surfaced as a generic 'ConcurrentModification'
    // 409. With M2 the use-case maps it to a domain-specific 'alreadyPaid()'
    // CONFLICT so the frontend can show a meaningful message.
    userRepo.findById.mockResolvedValue(makeOwner());
    prRepo.findById.mockResolvedValue(makePendingRequest());
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(makeFeeDue());
    academyRepo.findById.mockResolvedValue(makeAcademy());
    txLogRepo.incrementReceiptCounter.mockResolvedValue(1);
    feeDueRepo.save.mockRejectedValueOnce(new ConcurrentModificationError('FeeDue'));

    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      requestId: 'pr-1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
      // alreadyPaid() carries a stable "...already been paid" phrase — pin
      // a substring of it so a future error-text change doesn't silently
      // drift the user-facing message.
      expect(result.error.message.toLowerCase()).toContain('already been paid');
    }
  });

  describe('parent push on PARENT-source approval', () => {
    function makeParentRequest() {
      return PaymentRequest.create({
        id: 'pr-1',
        academyId: 'academy-1',
        studentId: 's1',
        feeDueId: 'due-1',
        monthKey: '2024-03',
        amount: 500,
        // staffUserId stores the parent's userId for PARENT-source requests
        // per the entity contract.
        staffUserId: 'parent-1',
        staffNotes: 'Manual payment via UPI',
        source: 'PARENT',
        proofImageUrl: 'https://r2.example/proof.jpg',
      });
    }

    function makeParentUser() {
      const u = User.create({
        id: 'parent-1',
        fullName: 'Parent',
        email: 'p@e.com',
        phoneNumber: '+919876511111',
        role: 'PARENT',
        passwordHash: 'h',
      });
      return User.reconstitute('parent-1', { ...u['props'], academyId: 'academy-1' });
    }

    function makeStudentEntity() {
      // Shape-compatible stand-in — the use-case only reads `.fullName`
      // from the resolved student. Avoids the heavy Student fixture setup.
      return { id: { toString: () => 's1' }, fullName: 'Aarav Sharma' } as never;
    }

    it('pushes to the parent (staffUserId) on approval when source === PARENT', async () => {
      userRepo.findById.mockResolvedValue(makeOwner());
      // The use-case calls findById a second time to resolve the staffUser
      // (which for a PARENT request is the parent themselves).
      userRepo.findById.mockResolvedValueOnce(makeOwner()).mockResolvedValueOnce(makeParentUser());
      prRepo.findById.mockResolvedValue(makeParentRequest());
      feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(makeFeeDue());
      academyRepo.findById.mockResolvedValue(makeAcademy());
      txLogRepo.incrementReceiptCounter.mockResolvedValue(1);
      studentRepo.findById.mockResolvedValue(makeStudentEntity());

      const pushService = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
      const uc = new ApprovePaymentRequestUseCase(
        userRepo,
        academyRepo,
        feeDueRepo,
        prRepo,
        txLogRepo,
        studentRepo,
        clock,
        tx,
        auditLogRepo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pushService as any,
      );

      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        requestId: 'pr-1',
      });

      expect(result.ok).toBe(true);
      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        ['parent-1'],
        expect.objectContaining({
          title: 'Payment approved',
          data: expect.objectContaining({ type: 'MANUAL_PAYMENT_APPROVED' }),
        }),
      );
    });

    it('does NOT push when source === STAFF (staff already see the queue)', async () => {
      userRepo.findById.mockResolvedValue(makeOwner());
      prRepo.findById.mockResolvedValue(makePendingRequest()); // STAFF source
      feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(makeFeeDue());
      academyRepo.findById.mockResolvedValue(makeAcademy());
      txLogRepo.incrementReceiptCounter.mockResolvedValue(1);
      studentRepo.findById.mockResolvedValue(makeStudentEntity());

      const pushService = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
      const uc = new ApprovePaymentRequestUseCase(
        userRepo,
        academyRepo,
        feeDueRepo,
        prRepo,
        txLogRepo,
        studentRepo,
        clock,
        tx,
        auditLogRepo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pushService as any,
      );

      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        requestId: 'pr-1',
      });

      expect(result.ok).toBe(true);
      expect(pushService.sendToUsers).not.toHaveBeenCalled();
    });
  });
});
