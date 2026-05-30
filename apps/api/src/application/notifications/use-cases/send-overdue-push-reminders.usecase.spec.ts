import { SendOverduePushRemindersUseCase } from './send-overdue-push-reminders.usecase';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { ClockPort } from '../../common/clock.port';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { PushNotificationService } from '../push-notification.service';
import type { Student } from '@domain/student/entities/student.entity';
import { FeeDue } from '@domain/fee/entities/fee-due.entity';
import type { LateFeeConfig } from '@academyflo/contracts';

// Late-fee snapshot stamped on the due while late fees were enabled.
const SNAPSHOT: LateFeeConfig = {
  lateFeeEnabled: true,
  gracePeriodDays: 0,
  lateFeeAmountInr: 100,
  lateFeeRepeatIntervalDays: 5,
};

// A ₹1000 DUE that is 1 day overdue vs the clock (2026-05-29), carrying a snapshot.
function makeOverdueDue(): FeeDue {
  const due = FeeDue.create({
    id: 'fee-1',
    academyId: 'academy-1',
    studentId: 'student-1',
    monthKey: '2026-05',
    dueDate: '2026-05-28',
    amount: 1000,
  });
  return FeeDue.reconstitute('fee-1', {
    ...(due as unknown as { props: Record<string, unknown> }).props,
    status: 'DUE',
    lateFeeConfigSnapshot: SNAPSHOT,
  } as never);
}

function buildDeps(academyLateFeeEnabled: boolean) {
  const sendToUsers = jest.fn().mockResolvedValue(undefined);
  const feeDueRepo = {
    findOverdueDues: jest.fn().mockResolvedValue([makeOverdueDue()]),
  } as unknown as jest.Mocked<FeeDueRepository>;
  const studentRepo = {
    findByIds: jest
      .fn()
      .mockResolvedValue([{ id: 'student-1', fullName: 'Aarav' }] as unknown as Student[]),
  } as unknown as jest.Mocked<StudentRepository>;
  const parentLinkRepo = {
    findByStudentId: jest.fn().mockResolvedValue([{ parentUserId: 'parent-1' }]),
  } as unknown as jest.Mocked<ParentStudentLinkRepository>;
  const pushService = { sendToUsers } as unknown as PushNotificationService;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as LoggerPort;
  const clock = {
    now: jest.fn().mockReturnValue(new Date('2026-05-29T12:00:00Z')),
  } as unknown as ClockPort;
  const academyRepo = {
    findById: jest.fn().mockResolvedValue({
      lateFeeEnabled: academyLateFeeEnabled,
      gracePeriodDays: 0,
      lateFeeAmountInr: 100,
      lateFeeRepeatIntervalDays: 5,
    }),
  } as unknown as jest.Mocked<AcademyRepository>;

  const uc = new SendOverduePushRemindersUseCase(
    feeDueRepo,
    studentRepo,
    parentLinkRepo,
    pushService,
    logger,
    clock,
    academyRepo,
  );
  return { uc, sendToUsers };
}

function pushBody(sendToUsers: jest.Mock): string {
  const [, message] = sendToUsers.mock.calls[0] as [string[], { body: string }];
  return message.body;
}

describe('SendOverduePushRemindersUseCase', () => {
  it('does NOT mention a late fee when the academy has late fees disabled (kill-switch), even with a snapshot', async () => {
    const { uc, sendToUsers } = buildDeps(false);
    const res = await uc.execute();

    expect(res.ok).toBe(true);
    expect(sendToUsers).toHaveBeenCalledTimes(1);
    const body = pushBody(sendToUsers);
    expect(body).toContain('₹1000');
    expect(body).not.toContain('late fee');
    expect(body).not.toContain('1100');
  });

  it('states the single combined total (base + late fee) when late fees are enabled', async () => {
    const { uc, sendToUsers } = buildDeps(true);
    const res = await uc.execute();

    expect(res.ok).toBe(true);
    expect(sendToUsers).toHaveBeenCalledTimes(1);
    const body = pushBody(sendToUsers);
    // 1000 base + 100 late = 1100 total, with breakdown — matches the Pay-now amount.
    expect(body).toContain('₹1100 (₹1000 fee + ₹100 late fee)');
  });
});
