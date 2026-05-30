import { ListUnpaidDuesUseCase } from './list-unpaid-dues.usecase';
import {
  InMemoryUserRepository,
  InMemoryFeeDueRepository,
  InMemoryAcademyRepository,
  InMemoryStudentRepository,
} from '../../../../test/helpers/in-memory-repos';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import { markDeleted, updateAuditFields } from '@shared/kernel';
import type { ClockPort } from '../../common/clock.port';

function createOwner(): User {
  const u = User.create({
    id: 'owner-1',
    fullName: 'Owner',
    email: 'owner@test.com',
    phoneNumber: '+919876543210',
    role: 'OWNER',
    passwordHash: 'hashed',
  });
  return User.reconstitute('owner-1', { ...u['props'], academyId: 'academy-1' });
}

function createStudent(id: string, name = 'Student'): Student {
  return Student.create({
    id,
    academyId: 'academy-1',
    fullName: name,
    dateOfBirth: new Date('2010-01-01'),
    gender: 'MALE',
    address: { line1: 'Addr', city: 'City', state: 'State', pincode: '400001' },
    guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
    joiningDate: new Date('2024-01-01'),
    monthlyFee: 500,
  });
}

function softDelete(student: Student, by = 'owner-1'): Student {
  return Student.reconstitute(student.id.toString(), {
    ...student['props'],
    audit: updateAuditFields(student.audit),
    softDelete: markDeleted(by),
  });
}

function createDue(studentId: string, monthKey = '2024-03'): FeeDue {
  return FeeDue.create({
    id: `${studentId}-${monthKey}`,
    academyId: 'academy-1',
    studentId,
    monthKey,
    dueDate: `${monthKey}-05`,
    amount: 500,
  }).flipToDue();
}

const fixedClock: ClockPort = {
  now: () => new Date('2024-03-10T10:00:00.000Z'),
};

describe('ListUnpaidDuesUseCase', () => {
  it('excludes dues for soft-deleted students from the list', async () => {
    const userRepo = new InMemoryUserRepository();
    const feeDueRepo = new InMemoryFeeDueRepository();
    const academyRepo = new InMemoryAcademyRepository();
    const studentRepo = new InMemoryStudentRepository();

    await userRepo.save(createOwner());

    const alive = createStudent('s-alive', 'Alive Student');
    const ghost = createStudent('s-ghost', 'Ghost Student');
    await studentRepo.save(alive);
    await studentRepo.save(softDelete(ghost));

    await feeDueRepo.save(createDue('s-alive'));
    await feeDueRepo.save(createDue('s-ghost'));

    const uc = new ListUnpaidDuesUseCase(
      userRepo,
      feeDueRepo,
      academyRepo,
      fixedClock,
      studentRepo,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: '2024-03',
      page: 1,
      pageSize: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.studentId).toBe('s-alive');
    expect(result.value.items[0]?.studentName).toBe('Alive Student');
    expect(result.value.meta.total).toBe(1);
  });

  it('still includes alive students with multiple unpaid months', async () => {
    const userRepo = new InMemoryUserRepository();
    const feeDueRepo = new InMemoryFeeDueRepository();
    const academyRepo = new InMemoryAcademyRepository();
    const studentRepo = new InMemoryStudentRepository();

    await userRepo.save(createOwner());
    await studentRepo.save(createStudent('s-alive', 'Alive Student'));
    await feeDueRepo.save(createDue('s-alive', '2024-03'));

    const uc = new ListUnpaidDuesUseCase(
      userRepo,
      feeDueRepo,
      academyRepo,
      fixedClock,
      studentRepo,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: '2024-03',
      page: 1,
      pageSize: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.studentName).toBe('Alive Student');
  });

  it('includes the contact phone and the total unpaid-months count per row', async () => {
    const userRepo = new InMemoryUserRepository();
    const feeDueRepo = new InMemoryFeeDueRepository();
    const academyRepo = new InMemoryAcademyRepository();
    const studentRepo = new InMemoryStudentRepository();

    await userRepo.save(createOwner());
    await studentRepo.save(createStudent('s-alive', 'Alive Student'));
    // Three unpaid months for the same student. We list only March, but the
    // row should still report the full count (3) and the contact phone.
    await feeDueRepo.save(createDue('s-alive', '2024-01'));
    await feeDueRepo.save(createDue('s-alive', '2024-02'));
    await feeDueRepo.save(createDue('s-alive', '2024-03'));

    const uc = new ListUnpaidDuesUseCase(
      userRepo,
      feeDueRepo,
      academyRepo,
      fixedClock,
      studentRepo,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: '2024-03',
      page: 1,
      pageSize: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1); // only March is listed
    const row = result.value.items[0];
    // No mobileNumber set → falls back to the guardian's mobile.
    expect(row?.studentPhone).toBe('+919876543210');
    expect(row?.unpaidMonthsCount).toBe(3); // Jan + Feb + Mar
  });

  it('returns empty page when every student with dues has been deleted', async () => {
    const userRepo = new InMemoryUserRepository();
    const feeDueRepo = new InMemoryFeeDueRepository();
    const academyRepo = new InMemoryAcademyRepository();
    const studentRepo = new InMemoryStudentRepository();

    await userRepo.save(createOwner());

    const ghost = createStudent('s-ghost');
    await studentRepo.save(softDelete(ghost));
    await feeDueRepo.save(createDue('s-ghost'));

    const uc = new ListUnpaidDuesUseCase(
      userRepo,
      feeDueRepo,
      academyRepo,
      fixedClock,
      studentRepo,
    );
    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: '2024-03',
      page: 1,
      pageSize: 50,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(0);
    expect(result.value.meta.total).toBe(0);
  });
});
