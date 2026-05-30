import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { PushNotificationService } from '../push-notification.service';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { ClockPort } from '../../common/clock.port';
import type { Result } from '@shared/kernel';
import { ok } from '@shared/kernel';
import { formatLocalDate } from '@shared/date-utils';
import { buildLateFeeConfigFromAcademy, lateFeeForUnpaidDue } from '../../fee/common/late-fee';

/** Minimal interface so we can accept QueueService without a hard dependency */
interface NotificationQueuePort {
  enqueueNotification(data: {
    userIds: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void>;
}

export interface OverduePushReminderSummary {
  runDate: string;
  totalOverdueDues: number;
  remindersSent: number;
  skippedNoParent: number;
}

/**
 * Determines if a push reminder should be sent for a given number of days overdue.
 *
 * Schedule: due date (0), +1, +2, +3, +7, +14. Stops after 30 days so
 * ghosted accounts don't get pinged forever — owners handle those manually.
 */
const REMINDER_OFFSETS = new Set([0, 1, 2, 3, 7, 14]);
const MAX_OVERDUE_DAYS = 30;

function shouldSendReminder(daysOverdue: number): boolean {
  if (daysOverdue < 0 || daysOverdue > MAX_OVERDUE_DAYS) return false;
  return REMINDER_OFFSETS.has(daysOverdue);
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
    private readonly academyRepo: AcademyRepository,
    private readonly notificationQueue?: NotificationQueuePort,
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

    // Load each due's academy's LIVE late-fee config. The push must honor the
    // owner's current late-fee toggle (kill-switch) — like the dashboard,
    // reports, receipts, and pay flow — not the snapshot frozen on the due.
    const academyIds = [...new Set(duesForToday.map((d) => d.academyId))];
    const academies = await Promise.all(academyIds.map((id) => this.academyRepo.findById(id)));
    const liveConfigByAcademy = new Map<string, ReturnType<typeof buildLateFeeConfigFromAcademy>>();
    for (let i = 0; i < academyIds.length; i++) {
      liveConfigByAcademy.set(academyIds[i]!, buildLateFeeConfigFromAcademy(academies[i]));
    }

    // Collect unique student IDs and find their parent links
    const studentIds = [...new Set(duesForToday.map((d) => d.studentId))];
    const studentMap = new Map<string, string>();
    const students = await this.studentRepo.findByIds(studentIds);
    for (const s of students) {
      studentMap.set(s.id.toString(), s.fullName);
    }

    // Find parent links for all students (parallel batch)
    const parentUserIdsByStudent = new Map<string, string[]>();
    const allLinks = await Promise.all(
      studentIds.map((id) => this.parentLinkRepo.findByStudentId(id)),
    );
    for (let i = 0; i < studentIds.length; i++) {
      const links = allLinks[i] ?? [];
      if (links.length > 0) {
        parentUserIdsByStudent.set(
          studentIds[i]!,
          links.map((l) => l.parentUserId),
        );
      }
    }

    // Send push notifications: use async queue when available, otherwise send directly
    for (const due of duesForToday) {
      const parentUserIds = parentUserIdsByStudent.get(due.studentId);
      if (!parentUserIds || parentUserIds.length === 0) {
        summary.skippedNoParent++;
        continue;
      }

      const studentName = studentMap.get(due.studentId) ?? 'your child';
      const daysOverdue = diffDays(due.dueDate, today);

      // Late fee respects the academy's LIVE late-fee toggle (kill-switch),
      // not just the snapshot frozen on the due, so a disabled toggle zeroes it
      // here exactly as it does on every screen, the receipt, and the pay flow.
      const lateFee = lateFeeForUnpaidDue(due, liveConfigByAcademy.get(due.academyId), today);
      const safeAmount = Number(due.amount) || 0;
      const safeLateFee = Number(lateFee) || 0;
      const totalDue = safeAmount + safeLateFee;
      // State the single TOTAL owed (with breakdown) so it matches the in-app
      // "Pay now" amount; a parent reading the headline cannot underpay.
      const amountText = safeLateFee > 0
        ? `\u20B9${totalDue} (\u20B9${safeAmount} fee + \u20B9${safeLateFee} late fee)`
        : `\u20B9${safeAmount}`;

      // Escalating tone as days pass — first ping is gentle, week-mark adds
      // urgency, two-week mark signals it's the last automated nudge.
      let body: string;
      if (daysOverdue === 0) {
        body = `Fee of ${amountText} for ${studentName} (${formatMonthKey(due.monthKey)}) is due today. Please pay to avoid late fees.`;
      } else if (daysOverdue === 1) {
        body = `Fee of ${amountText} for ${studentName} (${formatMonthKey(due.monthKey)}) was due yesterday. Please pay now.`;
      } else if (daysOverdue === 14) {
        body = `Final reminder: fee of ${amountText} for ${studentName} (${formatMonthKey(due.monthKey)}) is overdue by 2 weeks. Please pay immediately to avoid further action.`;
      } else if (daysOverdue === 7) {
        body = `Fee of ${amountText} for ${studentName} (${formatMonthKey(due.monthKey)}) has been overdue for a week. Please pay now.`;
      } else {
        body = `Fee of ${amountText} for ${studentName} (${formatMonthKey(due.monthKey)}) is overdue by ${daysOverdue} days. Please pay immediately.`;
      }

      const notificationPayload = {
        userIds: parentUserIds,
        title: 'Fee Payment Reminder',
        body,
        data: {
          type: 'FEE_REMINDER',
          studentId: due.studentId,
          feeDueId: due.id.toString(),
          monthKey: due.monthKey,
        },
      };

      try {
        if (this.notificationQueue) {
          await this.notificationQueue.enqueueNotification(notificationPayload);
        } else {
          await this.pushService.sendToUsers(parentUserIds, {
            title: notificationPayload.title,
            body: notificationPayload.body,
            data: notificationPayload.data,
          });
        }
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
