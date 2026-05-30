import { ChangeStudentStatusUseCase } from './change-student-status.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { TransactionPort } from '../../common/transaction.port';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { ParentStudentLink } from '@domain/parent/entities/parent-student-link.entity';

function createOwner(academyId: string | null = 'academy-1'): User {
  const user = User.create({
    id: 'owner-1',
    fullName: 'Owner User',
    email: 'owner@example.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
  if (academyId) {
    return User.reconstitute('owner-1', { ...user['props'], academyId });
  }
  return user;
}

function createStudent(academyId = 'academy-1'): Student {
  return Student.create({
    id: 'student-1',
    academyId,
    fullName: 'Aarav Sharma',
    dateOfBirth: new Date('2010-05-15'),
    gender: 'MALE',
    address: {
      line1: '123 Main Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    guardian: {
      name: 'Raj Sharma',
      mobile: '+919876543210',
      email: 'raj@example.com',
    },
    joiningDate: new Date('2024-01-01'),
    monthlyFee: 500,
  });
}

function makeParentLink(parentUserId: string) {
  return ParentStudentLink.create({
    id: `link-${parentUserId}`,
    academyId: 'academy-1',
    parentUserId,
    studentId: 'student-1',
  });
}

function buildDeps() {
  const userRepo: jest.Mocked<UserRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    updateAcademyId: jest.fn(),
    listByAcademyAndRole: jest.fn(),
    countActiveByAcademyAndRole: jest.fn().mockResolvedValue(0),
    incrementTokenVersionByAcademyId: jest.fn(),
    incrementTokenVersionByUserId: jest.fn(),
    listByAcademyId: jest.fn(),
    anonymizeAndSoftDelete: jest.fn(),
    listParentIdsByAcademy: jest.fn().mockResolvedValue([]),
  };

  const studentRepo: jest.Mocked<StudentRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    listActiveByAcademy: jest.fn(),
    countActiveByAcademy: jest.fn(),
    countScheduledStudentsByAcademyAndDate: jest.fn().mockResolvedValue(0),
    findByIds: jest.fn(),
    findBirthdaysByAcademy: jest.fn(),
    findByEmailInAcademy: jest.fn(),
    findByPhoneInAcademy: jest.fn(),
    countInactiveByAcademy: jest.fn(),
    countNewAdmissionsByAcademyAndDateRange: jest.fn(),
    saveWithVersionPrecondition: jest.fn().mockResolvedValue(true),
  };

  const parentLinkRepo: jest.Mocked<ParentStudentLinkRepository> = {
    save: jest.fn(),
    findByParentUserId: jest.fn(),
    findByStudentId: jest.fn().mockResolvedValue([]),
    findByParentAndStudent: jest.fn(),
    deleteAllByStudentId: jest.fn(),
    deleteByParentAndStudent: jest.fn(),
    findByAcademyId: jest.fn(),
  } as unknown as jest.Mocked<ParentStudentLinkRepository>;

  const feeDueRepo = {
    deleteUpcomingByStudent: jest.fn().mockResolvedValue(0),
  } as unknown as FeeDueRepository;

  const tx: TransactionPort = {
    run: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  };

  const auditRecorder = { record: jest.fn() };

  return { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder };
}

describe('ChangeStudentStatusUseCase', () => {
  it('changes status from ACTIVE to INACTIVE successfully', async () => {
    const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
    userRepo.findById.mockResolvedValue(createOwner());
    studentRepo.findById.mockResolvedValue(createStudent());

    const uc = new ChangeStudentStatusUseCase(
      userRepo,
      studentRepo,
      auditRecorder,
      feeDueRepo,
      tx,
      undefined,
      undefined,
      parentLinkRepo,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'student-1',
      status: 'INACTIVE',
    });

    expect(result.ok).toBe(true);
    expect(studentRepo.saveWithVersionPrecondition).toHaveBeenCalled();
  });

  it('rejects STAFF from changing status (OWNER only)', async () => {
    const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
    const staff = User.create({
      id: 'staff-1',
      fullName: 'Staff',
      email: 's@e.com',
      phoneNumber: '+919876543211',
      role: 'STAFF',
      passwordHash: 'h',
    });
    userRepo.findById.mockResolvedValue(
      User.reconstitute('staff-1', { ...staff['props'], academyId: 'academy-1' }),
    );

    const uc = new ChangeStudentStatusUseCase(
      userRepo,
      studentRepo,
      auditRecorder,
      feeDueRepo,
      tx,
      undefined,
      undefined,
      parentLinkRepo,
    );
    const result = await uc.execute({
      actorUserId: 'staff-1',
      actorRole: 'STAFF',
      studentId: 'student-1',
      status: 'INACTIVE',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN');
  });

  describe('M2: parent push on status change', () => {
    it('sends a status-changed push to all linked parents', async () => {
      const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(createStudent());
      parentLinkRepo.findByStudentId.mockResolvedValue([
        makeParentLink('parent-1'),
        makeParentLink('parent-2'),
      ]);

      const pushService = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
      const uc = new ChangeStudentStatusUseCase(
        userRepo,
        studentRepo,
        auditRecorder,
        feeDueRepo,
        tx,
        undefined,
        undefined,
        parentLinkRepo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pushService as any,
      );

      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        status: 'INACTIVE',
        reason: 'Family moved cities',
      });

      expect(result.ok).toBe(true);
      expect(pushService.sendToUsers).toHaveBeenCalledTimes(1);
      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        ['parent-1', 'parent-2'],
        expect.objectContaining({
          title: 'Student status updated',
          body: expect.stringContaining('Aarav Sharma'),
          data: expect.objectContaining({
            type: 'STUDENT_STATUS_CHANGED',
            newStatus: 'INACTIVE',
            reason: 'Family moved cities',
          }),
        }),
      );
    });

    it('does NOT push when no parent links exist', async () => {
      const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(createStudent());
      parentLinkRepo.findByStudentId.mockResolvedValue([]);

      const pushService = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
      const uc = new ChangeStudentStatusUseCase(
        userRepo,
        studentRepo,
        auditRecorder,
        feeDueRepo,
        tx,
        undefined,
        undefined,
        parentLinkRepo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pushService as any,
      );

      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        status: 'INACTIVE',
      });

      expect(result.ok).toBe(true);
      expect(pushService.sendToUsers).not.toHaveBeenCalled();
    });

    it('returns ok even when the push throws (best-effort delivery)', async () => {
      // Status change is the primary action — a push failure must NOT roll
      // back the saved status change.
      const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(createStudent());
      parentLinkRepo.findByStudentId.mockResolvedValue([makeParentLink('parent-1')]);

      const pushService = {
        sendToUsers: jest.fn().mockRejectedValue(new Error('FCM down')),
      };
      const uc = new ChangeStudentStatusUseCase(
        userRepo,
        studentRepo,
        auditRecorder,
        feeDueRepo,
        tx,
        undefined,
        undefined,
        parentLinkRepo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pushService as any,
      );

      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        status: 'LEFT',
      });

      expect(result.ok).toBe(true);
      expect(studentRepo.saveWithVersionPrecondition).toHaveBeenCalled();
    });
  });

  // L5 (student-management audit): the use case previously truncated `reason`
  // to 500 chars silently — caller lost data, audit log stored the prefix,
  // push/email used the untruncated value. These tests pin the new behavior:
  // reject oversize, accept boundary, and keep the audit context consistent
  // with the trimmed value.
  describe('L5: reason length validation', () => {
    it('rejects a reason longer than 500 characters', async () => {
      const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(createStudent());

      const uc = new ChangeStudentStatusUseCase(
        userRepo,
        studentRepo,
        auditRecorder,
        feeDueRepo,
        tx,
        undefined,
        undefined,
        parentLinkRepo,
      );
      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        status: 'INACTIVE',
        reason: 'X'.repeat(501),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('VALIDATION');
      // Status change must not have happened.
      expect(studentRepo.saveWithVersionPrecondition).not.toHaveBeenCalled();
      expect(auditRecorder.record).not.toHaveBeenCalled();
    });

    it('accepts a reason at the boundary (exactly 500 characters)', async () => {
      const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(createStudent());

      const uc = new ChangeStudentStatusUseCase(
        userRepo,
        studentRepo,
        auditRecorder,
        feeDueRepo,
        tx,
        undefined,
        undefined,
        parentLinkRepo,
      );
      const reason500 = 'X'.repeat(500);
      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        status: 'INACTIVE',
        reason: reason500,
      });

      expect(result.ok).toBe(true);
      // Audit log must record the FULL reason, not a slice — that was the
      // pre-fix inconsistency between audit and notifications.
      const auditCall = auditRecorder.record.mock.calls[0]![0];
      expect(auditCall.context.reason).toBe(reason500);
    });

    it('treats a reason that is whitespace-only as null after trimming', async () => {
      // Edge case: a UI that auto-fills "  " into the reason field shouldn't
      // get a validation error, just a null reason in the audit log.
      const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(createStudent());

      const uc = new ChangeStudentStatusUseCase(
        userRepo,
        studentRepo,
        auditRecorder,
        feeDueRepo,
        tx,
        undefined,
        undefined,
        parentLinkRepo,
      );
      const result = await uc.execute({
        actorUserId: 'owner-1',
        actorRole: 'OWNER',
        studentId: 'student-1',
        status: 'INACTIVE',
        reason: '     ',
      });

      expect(result.ok).toBe(true);
      const auditCall = auditRecorder.record.mock.calls[0]![0];
      // Empty trim collapses to '' which is falsy — the audit context omits
      // the reason key rather than storing an empty string.
      expect(auditCall.context.reason).toBeUndefined();
    });
  });

  describe('Option B: frees batch slots when leaving ACTIVE', () => {
    function inactiveStudent(): Student {
      return Student.reconstitute('student-1', {
        ...(createStudent() as unknown as { props: Record<string, unknown> }).props,
        status: 'INACTIVE',
      } as never);
    }

    it.each(['INACTIVE', 'LEFT'] as const)(
      "clears the student's batch enrollments on transition to %s",
      async (status) => {
        const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
        userRepo.findById.mockResolvedValue(createOwner());
        studentRepo.findById.mockResolvedValue(createStudent());
        const studentBatchRepo = {
          replaceForStudent: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<StudentBatchRepository>;

        const uc = new ChangeStudentStatusUseCase(
          userRepo, studentRepo, auditRecorder, feeDueRepo, tx,
          undefined, undefined, parentLinkRepo, undefined, studentBatchRepo,
        );
        const result = await uc.execute({
          actorUserId: 'owner-1', actorRole: 'OWNER', studentId: 'student-1', status,
        });

        expect(result.ok).toBe(true);
        expect(studentBatchRepo.replaceForStudent).toHaveBeenCalledWith('student-1', []);
      },
    );

    it('does NOT clear enrollments when reactivating (→ ACTIVE)', async () => {
      const { userRepo, studentRepo, parentLinkRepo, feeDueRepo, tx, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(inactiveStudent());
      const studentBatchRepo = {
        replaceForStudent: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<StudentBatchRepository>;

      const uc = new ChangeStudentStatusUseCase(
        userRepo, studentRepo, auditRecorder, feeDueRepo, tx,
        undefined, undefined, parentLinkRepo, undefined, studentBatchRepo,
      );
      const result = await uc.execute({
        actorUserId: 'owner-1', actorRole: 'OWNER', studentId: 'student-1', status: 'ACTIVE',
      });

      expect(result.ok).toBe(true);
      expect(studentBatchRepo.replaceForStudent).not.toHaveBeenCalled();
    });

    it('hard-fails if leaving ACTIVE without a transaction (cleanup must be atomic)', async () => {
      const { userRepo, studentRepo, parentLinkRepo, auditRecorder } = buildDeps();
      userRepo.findById.mockResolvedValue(createOwner());
      studentRepo.findById.mockResolvedValue(createStudent());
      const studentBatchRepo = {
        replaceForStudent: jest.fn(),
      } as unknown as jest.Mocked<StudentBatchRepository>;

      // Batch cleanup needed but no TransactionPort injected → must throw.
      const uc = new ChangeStudentStatusUseCase(
        userRepo, studentRepo, auditRecorder, undefined, undefined,
        undefined, undefined, parentLinkRepo, undefined, studentBatchRepo,
      );
      await expect(
        uc.execute({ actorUserId: 'owner-1', actorRole: 'OWNER', studentId: 'student-1', status: 'LEFT' }),
      ).rejects.toThrow(/TransactionPort is required/);
      expect(studentBatchRepo.replaceForStudent).not.toHaveBeenCalled();
    });
  });
});
