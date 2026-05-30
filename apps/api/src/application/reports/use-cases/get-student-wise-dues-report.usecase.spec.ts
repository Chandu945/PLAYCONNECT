import { GetStudentWiseDuesReportUseCase } from './get-student-wise-dues-report.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { ClockPort } from '../../common/clock.port';
import type { Student } from '@domain/student/entities/student.entity';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import type { User } from '@domain/identity/entities/user.entity';
import type { FeeDueStatus } from '@academyflo/contracts';

const MONTH = '2026-04';

function makeDue(id: string, studentId: string, amount: number, status: FeeDueStatus): FeeDue {
  const due = FeeDue.create({
    id,
    academyId: 'academy-1',
    studentId,
    monthKey: MONTH,
    dueDate: `${MONTH}-10`,
    amount,
  });
  // create() starts as UPCOMING; reconstitute to set the desired status.
  return FeeDue.reconstitute(id, {
    ...(due as unknown as { props: Record<string, unknown> }).props,
    status,
  } as never);
}

function makeOwner(): User {
  // The report use-case only reads user.academyId, so a minimal stub suffices.
  return { academyId: 'academy-1' } as unknown as User;
}

// Academy with late fees ON: ₹100 per 30-day interval, no grace.
const LATE_FEE_ACADEMY = {
  lateFeeEnabled: true,
  gracePeriodDays: 0,
  lateFeeAmountInr: 100,
  lateFeeRepeatIntervalDays: 30,
};

describe('GetStudentWiseDuesReportUseCase', () => {
  let userRepo: jest.Mocked<UserRepository>;
  let studentRepo: jest.Mocked<StudentRepository>;
  let feeDueRepo: jest.Mocked<FeeDueRepository>;
  let academyRepo: jest.Mocked<AcademyRepository>;
  let clock: jest.Mocked<ClockPort>;

  // Two unpaid students + one already-paid student for the month. The repo
  // mock honours the status filter it is given, simulating the DB WHERE clause.
  const monthFixtures = [
    makeDue('f1', 'student-1', 1000, 'DUE'),
    makeDue('f2', 'student-2', 1000, 'UPCOMING'),
    makeDue('f3', 'student-3', 1000, 'PAID'),
  ];

  function makeUc() {
    return new GetStudentWiseDuesReportUseCase(userRepo, studentRepo, feeDueRepo, academyRepo, clock);
  }

  beforeEach(() => {
    userRepo = {
      findById: jest.fn().mockResolvedValue(makeOwner()),
    } as unknown as jest.Mocked<UserRepository>;
    studentRepo = {
      findByIds: jest.fn().mockResolvedValue([
        { id: 'student-1', fullName: 'Alice' },
        { id: 'student-2', fullName: 'Bob' },
      ] as unknown as Student[]),
    } as unknown as jest.Mocked<StudentRepository>;
    feeDueRepo = {
      listByAcademyMonthAndStatuses: jest
        .fn()
        .mockImplementation(async (_a: string, _m: string, statuses: FeeDueStatus[]) =>
          monthFixtures.filter((d) => statuses.includes(d.status)),
        ),
      listByAcademyAndMonth: jest.fn().mockResolvedValue(monthFixtures),
      listUnpaidByAcademy: jest
        .fn()
        .mockResolvedValue(monthFixtures.filter((d) => d.status !== 'PAID')),
    } as unknown as jest.Mocked<FeeDueRepository>;
    // Default: late fees OFF (findById → null), so amounts stay base-only.
    academyRepo = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<AcademyRepository>;
    clock = {
      now: jest.fn().mockReturnValue(new Date('2026-05-29T12:00:00Z')),
    } as unknown as jest.Mocked<ClockPort>;
  });

  it('omits already-paid students from the list and the row count', async () => {
    const res = await makeUc().execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: MONTH,
      page: 1,
      pageSize: 50,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.items).toHaveLength(2);
    expect(res.value.items.map((i) => i.studentId).sort()).toEqual(['student-1', 'student-2']);
    expect(res.value.items.some((i) => i.status === 'PAID')).toBe(false);
    expect(res.value.meta.total).toBe(2);
  });

  it('queries only unpaid (UPCOMING/DUE) dues for the month, never all dues', async () => {
    await makeUc().execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: MONTH,
      page: 1,
      pageSize: 50,
    });

    expect(feeDueRepo.listByAcademyMonthAndStatuses).toHaveBeenCalledWith('academy-1', MONTH, [
      'UPCOMING',
      'DUE',
    ]);
    expect(feeDueRepo.listByAcademyAndMonth).not.toHaveBeenCalled();
  });

  it('includes the accrued late fee in each row and the cross-month total', async () => {
    academyRepo.findById.mockResolvedValue(LATE_FEE_ACADEMY as never);

    const res = await makeUc().execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: MONTH,
      page: 1,
      pageSize: 50,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // student-1's DUE (dueDate 2026-04-10) is overdue vs the clock (2026-05-29).
    const row = res.value.items.find((i) => i.studentId === 'student-1')!;
    expect(row.lateFee).toBeGreaterThan(0);
    expect(row.totalPayable).toBe(row.amount + row.lateFee);
    // Cross-month total must include the late fee, not just base.
    expect(row.totalPendingAmount).toBe(row.amount + row.lateFee);
  });

  it('applies no late fee when the academy has late fees disabled', async () => {
    // Default academyRepo returns null → late fees off.
    const res = await makeUc().execute({
      actorUserId: 'owner-1',
      actorRole: 'OWNER',
      month: MONTH,
      page: 1,
      pageSize: 50,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const row of res.value.items) {
      expect(row.lateFee).toBe(0);
      expect(row.totalPayable).toBe(row.amount);
    }
  });
});
