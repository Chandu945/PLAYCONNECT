import { CreatePaymentRequestUseCase } from './create-payment-request.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '@domain/fee/ports/payment-request.repository';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';

describe('CreatePaymentRequestUseCase', () => {
  let useCase: CreatePaymentRequestUseCase;
  let userRepo: jest.Mocked<UserRepository>;
  let studentRepo: jest.Mocked<StudentRepository>;
  let feeDueRepo: jest.Mocked<FeeDueRepository>;
  let prRepo: jest.Mocked<PaymentRequestRepository>;

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

    studentRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      list: jest.fn(),
      listActiveByAcademy: jest.fn(),
      countActiveByAcademy: jest.fn(),
      findByIds: jest.fn(),
      findBirthdaysByAcademy: jest.fn(),
      countInactiveByAcademy: jest.fn(),
      countNewAdmissionsByAcademyAndDateRange: jest.fn(),
    } as jest.Mocked<StudentRepository>;

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

    const auditRecorder = { record: jest.fn() };

    useCase = new CreatePaymentRequestUseCase(
      userRepo,
      studentRepo,
      feeDueRepo,
      prRepo,
      auditRecorder,
    );
  });

  function makeStaff() {
    const user = User.create({
      id: 'staff-1',
      fullName: 'Staff',
      email: 'staff@test.com',
      phoneNumber: '+919876543210',
      role: 'STAFF',
      passwordHash: 'hashed',
    });
    return User.reconstitute('staff-1', { ...user['props'], academyId: 'academy-1' });
  }

  function makeStudent() {
    return Student.create({
      id: 's1',
      academyId: 'academy-1',
      fullName: 'Student S1',
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: 500,
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

  it('should create a payment request for staff', async () => {
    userRepo.findById.mockResolvedValue(makeStaff());
    studentRepo.findById.mockResolvedValue(makeStudent());
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(makeFeeDue());
    prRepo.findPendingByFeeDue.mockResolvedValue(null);

    const result = await useCase.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 's1',
      monthKey: '2024-03',
      staffNotes: 'Collected from parent',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING');
      expect(result.value.staffUserId).toBe('staff-1');
      expect(result.value.amount).toBe(500);
    }
    expect(prRepo.save).toHaveBeenCalled();
  });

  it('should reject non-STAFF role', async () => {
    const result = await useCase.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 's1',
      monthKey: '2024-03',
      staffNotes: 'Collected from parent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should reject if due is already PAID', async () => {
    userRepo.findById.mockResolvedValue(makeStaff());
    studentRepo.findById.mockResolvedValue(makeStudent());
    const paidDue = makeFeeDue().markPaid('owner-1', new Date());
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(paidDue);

    const result = await useCase.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 's1',
      monthKey: '2024-03',
      staffNotes: 'Collected from parent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject duplicate pending request', async () => {
    userRepo.findById.mockResolvedValue(makeStaff());
    studentRepo.findById.mockResolvedValue(makeStudent());
    feeDueRepo.findByAcademyStudentMonth.mockResolvedValue(makeFeeDue());

    const { PaymentRequest } = await import('@domain/fee/entities/payment-request.entity');
    prRepo.findPendingByFeeDue.mockResolvedValue(
      PaymentRequest.create({
        id: 'pr-existing',
        academyId: 'academy-1',
        studentId: 's1',
        feeDueId: 'due-1',
        monthKey: '2024-03',
        amount: 500,
        staffUserId: 'staff-1',
        staffNotes: 'Already pending',
      }),
    );

    const result = await useCase.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 's1',
      monthKey: '2024-03',
      staffNotes: 'Collected from parent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('should reject if student not in same academy', async () => {
    userRepo.findById.mockResolvedValue(makeStaff());
    const otherStudent = Student.create({
      id: 's2',
      academyId: 'other-academy',
      fullName: 'Other Student',
      dateOfBirth: new Date('2010-01-01'),
      gender: 'MALE',
      address: { line1: '123 St', city: 'City', state: 'ST', pincode: '400001' },
      guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
      joiningDate: new Date('2024-01-01'),
      monthlyFee: 500,
    });
    studentRepo.findById.mockResolvedValue(otherStudent);

    const result = await useCase.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 's2',
      monthKey: '2024-03',
      staffNotes: 'Collected from parent',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });
});
