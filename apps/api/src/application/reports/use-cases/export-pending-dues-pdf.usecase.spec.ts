import { ExportPendingDuesPdfUseCase } from './export-pending-dues-pdf.usecase';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { ClockPort } from '../../common/clock.port';
import type { PdfRenderer } from '../ports/pdf-renderer.port';
import type { Student } from '@domain/student/entities/student.entity';
import type { StudentWiseDueItemDto } from '../dtos/student-wise-dues.dto';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import type { User } from '@domain/identity/entities/user.entity';
import type { FeeDueStatus } from '@academyflo/contracts';

const MONTH = '2026-04';

const LATE_FEE_ACADEMY = {
  lateFeeEnabled: true,
  gracePeriodDays: 0,
  lateFeeAmountInr: 100,
  lateFeeRepeatIntervalDays: 30,
};

function makeDue(id: string, studentId: string, amount: number, status: FeeDueStatus): FeeDue {
  const due = FeeDue.create({
    id,
    academyId: 'academy-1',
    studentId,
    monthKey: MONTH,
    dueDate: `${MONTH}-10`,
    amount,
  });
  return FeeDue.reconstitute(id, {
    ...(due as unknown as { props: Record<string, unknown> }).props,
    status,
  } as never);
}

function makeOwner(): User {
  return { academyId: 'academy-1' } as unknown as User;
}

function buildDeps() {
  const monthFixtures = [
    makeDue('f1', 'student-1', 1000, 'DUE'),
    makeDue('f2', 'student-2', 1000, 'UPCOMING'),
    makeDue('f3', 'student-3', 1000, 'PAID'),
  ];
  const userRepo = {
    findById: jest.fn().mockResolvedValue(makeOwner()),
  } as unknown as jest.Mocked<UserRepository>;
  const studentRepo = {
    findByIds: jest.fn().mockResolvedValue([
      { id: 'student-1', fullName: 'Alice' },
      { id: 'student-2', fullName: 'Bob' },
    ] as unknown as Student[]),
  } as unknown as jest.Mocked<StudentRepository>;
  const feeDueRepo = {
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
  const renderPendingDues = jest.fn().mockResolvedValue(Buffer.from('pdf'));
  const pdfRenderer = { renderPendingDues } as unknown as PdfRenderer;
  const academyRepo = {
    findById: jest.fn().mockResolvedValue(null), // late fees off by default
  } as unknown as jest.Mocked<AcademyRepository>;
  const clock = {
    now: jest.fn().mockReturnValue(new Date('2026-05-29T12:00:00Z')),
  } as unknown as jest.Mocked<ClockPort>;

  const uc = new ExportPendingDuesPdfUseCase(
    userRepo,
    studentRepo,
    feeDueRepo,
    pdfRenderer,
    academyRepo,
    clock,
  );
  return { uc, renderPendingDues, academyRepo };
}

function itemsPassedToRenderer(renderPendingDues: jest.Mock): StudentWiseDueItemDto[] {
  const [, items] = renderPendingDues.mock.calls[0] as [string, StudentWiseDueItemDto[]];
  return items;
}

describe('ExportPendingDuesPdfUseCase', () => {
  it('passes only unpaid rows to the PDF renderer (paid students excluded)', async () => {
    const { uc, renderPendingDues } = buildDeps();
    const res = await uc.execute({ actorUserId: 'owner-1', actorRole: 'OWNER', month: MONTH });

    expect(res.ok).toBe(true);
    expect(renderPendingDues).toHaveBeenCalledTimes(1);

    const items = itemsPassedToRenderer(renderPendingDues);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.status === 'PAID')).toBe(false);
    // With late fees off, the renderer's "Total Pending" (sum of totalPayable) = 2000, not 3000.
    expect(items.reduce((sum, i) => sum + i.totalPayable, 0)).toBe(2000);
  });

  it('includes late fees in each row so the PDF total is base + late, not base-only', async () => {
    const { uc, renderPendingDues, academyRepo } = buildDeps();
    academyRepo.findById.mockResolvedValue(LATE_FEE_ACADEMY as never);

    const res = await uc.execute({ actorUserId: 'owner-1', actorRole: 'OWNER', month: MONTH });
    expect(res.ok).toBe(true);

    const items = itemsPassedToRenderer(renderPendingDues);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.lateFee).toBeGreaterThan(0);
      expect(item.totalPayable).toBe(item.amount + item.lateFee);
    }
    // The "Total Pending" the renderer prints now exceeds the base-only 2000.
    expect(items.reduce((sum, i) => sum + i.totalPayable, 0)).toBeGreaterThan(2000);
  });
});
