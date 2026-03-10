import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { PushNotificationService } from '../push-notification.service';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { ClockPort } from '../../common/clock.port';
import type { Result } from '@shared/kernel';
import { ok } from '@shared/kernel';
import { formatLocalDate } from '@shared/date-utils';

export interface OverduePushReminderSummary {
  runDate: string;
  totalOverdueDues: number;
  remindersSent: number;
  skippedNoParent: number;
}

/**
 * Determines if a push reminder should be sent for a given number of days overdue.
 *
 * Schedule: due date (0), +1 day, +2 days, then every 3 days (5, 8, 11, ...)
 */
function shouldSendReminder(daysOverdue: number): boolean {
  if (daysOverdue < 0) return false;
  if (daysOverdue <= 2) return true;
  return (daysOverdue - 2) % 3 === 0;
}

function diffDays(dueDateStr: string, todayStr: string): number {
  const [dy, dm, dd] = dueDateStr.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = todayStr.split('-').map(Number) as [number, number, number];
  const due = new Date(dy, dm - 1, dd);
  const today = new Date(ty, tm - 1, td);
  return Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const idx = parseInt(month ?? '0', 10) - 1;
  return `${MONTH_NAMES[idx] ?? month} ${year}`;
}

export class SendOverduePushRemindersUseCase {
  constructor(
    private readonly feeDueRepo: FeeDueRepository,
    private readonly studentRepo: StudentRepository,
    private readonly parentLinkRepo: ParentStudentLinkRepository,
    private readonly pushService: PushNotificationService,
    private readonly logger: LoggerPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<Result<OverduePushReminderSummary, never>> {
    const now = this.clock.now();
    const today = formatLocalDate(now);

    const summary: OverduePushReminderSummary = {
      runDate: today,
      totalOverdueDues: 0,
      remindersSent: 0,
      skippedNoParent: 0,
    };

    const overdueDues = await this.feeDueRepo.findOverdueDues(today);
    summary.totalOverdueDues = overdueDues.length;

    if (overdueDues.length === 0) {
      this.logger.info('Overdue push reminders: no overdue dues found', { today });
      return ok(summary);
    }

    // Filter to only those that should get a reminder today
    const duesForToday = overdueDues.filter((due) => {
      const days = diffDays(due.dueDate, today);
      return shouldSendReminder(days);
    });

    if (duesForToday.length === 0) {
      this.logger.info('Overdue push reminders: no dues match reminder schedule today', {
        today,
        totalOverdue: overdueDues.length,
      });
      return ok(summary);
    }

    // Collect unique student IDs and find their parent links
    const studentIds = [...new Set(duesForToday.map((d) => d.studentId))];
    const studentMap = new Map<string, string>();
    const students = await this.studentRepo.findByIds(studentIds);
    for (const s of students) {
      studentMap.set(s.id.toString(), s.fullName);
    }

    // Find parent links for all students
    const parentUserIdsByStudent = new Map<string, string[]>();
    for (const studentId of studentIds) {
      const links = await this.parentLinkRepo.findByStudentId(studentId);
      if (links.length > 0) {
        parentUserIdsByStudent.set(
          studentId,
          links.map((l) => l.parentUserId),
        );
      }
    }

    // Send push notifications
    for (const due of duesForToday) {
      const parentUserIds = parentUserIdsByStudent.get(due.studentId);
      if (!parentUserIds || parentUserIds.length === 0) {
        summary.skippedNoParent++;
        continue;
      }

      const studentName = studentMap.get(due.studentId) ?? 'your child';
      const daysOverdue = diffDays(due.dueDate, today);

      let body: string;
      if (daysOverdue === 0) {
        body = `Fee of \u20B9${due.amount} for ${studentName} (${formatMonthKey(due.monthKey)}) is due today. Please pay to avoid late fees.`;
      } else if (daysOverdue === 1) {
        body = `Fee of \u20B9${due.amount} for ${studentName} (${formatMonthKey(due.monthKey)}) was due yesterday. Please pay now.`;
      } else {
        body = `Fee of \u20B9${due.amount} for ${studentName} (${formatMonthKey(due.monthKey)}) is overdue by ${daysOverdue} days. Please pay immediately.`;
      }

      try {
        await this.pushService.sendToUsers(parentUserIds, {
          title: 'Fee Payment Reminder',
          body,
          data: {
            type: 'FEE_REMINDER',
            studentId: due.studentId,
            feeDueId: due.id.toString(),
            monthKey: due.monthKey,
          },
        });
        summary.remindersSent++;
      } catch {
        this.logger.warn('Overdue push reminder failed', {
          studentId: due.studentId,
          monthKey: due.monthKey,
        });
      }
    }

    this.logger.info('Overdue push reminders: run completed', summary as unknown as Record<string, unknown>);
    return ok(summary);
  }
}
