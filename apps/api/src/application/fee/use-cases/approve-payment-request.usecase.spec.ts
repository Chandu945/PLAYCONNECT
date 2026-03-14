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
      incrementTokenVersionByAcademyId: jest.fn(),
      incrementTokenVersionByUserId: jest.fn(),
      listByAcademyId: jest.fn(),
    } as jest.Mocked<UserRepository>;

    academyRepo = {
      findById: jest.fn(),
      findByOwnerUserId: jest.fn(),
      save: jest.fn(),
      findAllIds: jest.fn(),
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
      findUnpaidByDueDate: jest.fn(),
      findOverdueDues: jest.fn(),
      findDueWithoutSnapshot: jest.fn(),
      deleteUpcomingByStudent: jest.fn(),
    } as jest.Mocked<FeeDueRepository>;

    prRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findPendingByFeeDue: jest.fn(),
      listByAcademyAndStatuses: jest.fn(),
      listByStaffAndAcademy: jest.fn(),
      countPendingByAcademy: jest.fn(),
    } as jest.Mocked<PaymentRequestRepository>;

    txLogRepo = {
      save: jest.fn(),
      findByPaymentRequestId: jest.fn(),
      listByAcademy: jest.fn(),
      countByAcademyAndPrefix: jest.fn(),
      sumRevenueByAcademyAndDateRange: jest.fn(),
      listByAcademyAndDateRange: jest.fn(),
      findByFeeDueId: jest.fn(),
      listByStudentIds: jest.fn(),
      sumRevenueByAcademyGroupedByMonth: jest.fn(),
    } as jest.Mocked<TransactionLogRepository>;

    studentRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      listActiveByAcademy: jest.fn(),
      countActiveByAcademy: jest.fn(),
      findByIds: jest.fn(),
      countInactiveByAcademy: jest.fn(),
      countNewAdmissionsByAcademyAndDateRange: jest.fn(),
      findBirthdaysByAcademy: jest.fn(),
    } as jest.Mocked<StudentRepository>;

    clock = { now: () => fixedNow };
    tx = { run: jest.fn().mockImplementation((fn) => fn()) };

    auditLogRepo = { save: jest.fn(), listByAcademy: jest.fn() } as jest.Mocked<AuditLogRepository>;

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
});
