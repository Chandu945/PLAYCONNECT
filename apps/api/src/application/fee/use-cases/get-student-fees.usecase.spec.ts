import { GetStudentFeesUseCase } from './get-student-fees.usecase';
import {
  InMemoryUserRepository,
  InMemoryStudentRepository,
  InMemoryFeeDueRepository,
  InMemoryAcademyRepository,
} from '../../../../test/helpers/in-memory-repos';
import { User } from '@domain/identity/entities/user.entity';
import { Student } from '@domain/student/entities/student.entity';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import type { ClockPort } from '../../common/clock.port';

const clock: ClockPort = { now: () => new Date('2026-06-02T10:00:00.000Z') };

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

function createStudent(): Student {
  return Student.create({
    id: 'stu-1',
    academyId: 'academy-1',
    fullName: 'Dhruv Verma',
    dateOfBirth: new Date('2010-01-01'),
    gender: 'MALE',
    address: { line1: 'Addr', city: 'City', state: 'State', pincode: '400001' },
    guardian: { name: 'Parent', mobile: '+919876543210', email: 'p@test.com' },
    joiningDate: new Date('2025-10-01'), // joined LAST year
    monthlyFee: 800,
  });
}

function createDue(monthKey: string): FeeDue {
  return FeeDue.create({
    id: `stu-1-${monthKey}`,
    academyId: 'academy-1',
    studentId: 'stu-1',
    monthKey,
    dueDate: `${monthKey}-05`,
    amount: 800,
  }).flipToDue();
}

async function setup() {
  const userRepo = new InMemoryUserRepository();
  const studentRepo = new InMemoryStudentRepository();
  const feeDueRepo = new InMemoryFeeDueRepository();
  const academyRepo = new InMemoryAcademyRepository();

  await userRepo.save(createOwner());
  await studentRepo.save(createStudent());
  await feeDueRepo.save(createDue('2025-11')); // previous-year overdue
  await feeDueRepo.save(createDue('2026-06')); // current month

  const uc = new GetStudentFeesUseCase(userRepo, studentRepo, feeDueRepo, academyRepo, clock);
  return { uc };
}

describe('GetStudentFeesUseCase — full-history default', () => {
  it('returns the previous-year overdue due when no range is supplied (defaults from joining month)', async () => {
    const { uc } = await setup();

    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'stu-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const months = result.value.map((d) => d.monthKey).sort();
    // Nov 2025 (previous year) must be present — the bug was that it was hidden.
    expect(months).toEqual(['2025-11', '2026-06']);
  });

  it('still honours an explicit range when provided (Nov 2025 excluded)', async () => {
    const { uc } = await setup();

    const result = await uc.execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      studentId: 'stu-1',
      from: '2026-01',
      to: '2026-06',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((d) => d.monthKey)).toEqual(['2026-06']);
  });
});
