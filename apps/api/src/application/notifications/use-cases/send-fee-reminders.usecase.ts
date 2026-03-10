import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { SubscriptionRepository } from '@domain/subscription/ports/subscription.repository';
import type { EmailSenderPort, EmailMessage } from '../ports/email-sender.port';
import type { PushNotificationService } from '../push-notification.service';
import type { LoggerPort } from '@shared/logging/logger.port';
import type { ClockPort } from '../../common/clock.port';
import type { FeeDue } from '@domain/fee/entities/fee-due.entity';
import type { Student } from '@domain/student/entities/student.entity';
import type { FeeReminderRunSummary } from '@playconnect/contracts';
import type { Result } from '@shared/kernel';
import { ok } from '@shared/kernel';
import { formatLocalDate, addDaysToLocalDate } from '@shared/date-utils';
import { evaluateSubscriptionStatus } from '@domain/subscription/rules/subscription.rules';
import { renderFeeReminderEmail } from './fee-reminder-template';

const CONCURRENCY = 5;

export class SendFeeRemindersUseCase {
  constructor(
    private readonly feeDueRepo: FeeDueRepository,
    private readonly studentRepo: StudentRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly emailSender: EmailSenderPort,
    private readonly logger: LoggerPort,
    private readonly clock: ClockPort,
    private readonly pushService?: PushNotificationService,
  ) {}

  async execute(): Promise<Result<FeeReminderRunSummary, never>> {
    const now = this.clock.now();
    const runDate = formatLocalDate(now);
    const targetDueDate = addDaysToLocalDate(runDate, 3);

    const summary: FeeReminderRunSummary = {
      runDate,
      targetDueDate,
      totalDuesFound: 0,
      academiesProcessed: 0,
      academiesSkipped: 0,
      emailsSent: 0,
      emailsFailed: 0,
      studentsSkippedNoEmail: 0,
    };

    const allDues = await this.feeDueRepo.findUnpaidByDueDate(targetDueDate);
    summary.totalDuesFound = allDues.length;

    if (allDues.length === 0) {
      this.logger.info('Fee reminders: no dues found', { runDate, targetDueDate });
      return ok(summary);
    }

    // Group by academyId
    const byAcademy = new Map<string, FeeDue[]>();
    for (const due of allDues) {
      const list = byAcademy.get(due.academyId) ?? [];
      list.push(due);
      byAcademy.set(due.academyId, list);
    }

    const messages: EmailMessage[] = [];

    for (const [academyId, dues] of byAcademy) {
      const academy = await this.academyRepo.findById(academyId);
      if (!academy) {
        this.logger.warn('Fee reminders: academy not found, skipping', { academyId });
        summary.academiesSkipped++;
        continue;
      }

      const subscription = await this.subscriptionRepo.findByAcademyId(academyId);
      if (!subscription) {
        this.logger.warn('Fee reminders: subscription not found, skipping', { academyId });
        summary.academiesSkipped++;
        continue;
      }

      const evaluation = evaluateSubscriptionStatus(now, academy.loginDisabled, subscription);
      if (!evaluation.canAccessApp) {
        this.logger.info('Fee reminders: academy subscription inactive, skipping', {
          academyId,
          status: evaluation.status,
        });
        summary.academiesSkipped++;
        continue;
      }

      summary.academiesProcessed++;

      const studentIds = dues.map((d) => d.studentId);
      const students = await this.studentRepo.findByIds(studentIds);
      const studentMap = new Map<string, Student>();
      for (const s of students) {
        studentMap.set(s.id.toString(), s);
      }

      for (const due of dues) {
        const student = studentMap.get(due.studentId);
        if (!student) {
          this.logger.warn('Fee reminders: student not found, skipping', {
            studentId: due.studentId,
          });
          summary.studentsSkippedNoEmail++;
          continue;
        }

        const recipient = student.email || student.guardian.email || null;
        if (!recipient) {
          summary.studentsSkippedNoEmail++;
          continue;
        }

        const html = renderFeeReminderEmail({
          studentName: student.fullName,
          academyName: academy.academyName,
          amount: due.amount,
          dueDate: due.dueDate,
          monthKey: due.monthKey,
        });

        messages.push({
          to: recipient,
          subject: `Fee Reminder - ${student.fullName} (${due.monthKey})`,
          html,
        });
      }
    }

    // Send emails in chunks of CONCURRENCY
    for (let i = 0; i < messages.length; i += CONCURRENCY) {
      const chunk = messages.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((msg) => this.emailSender.send(msg)));

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          summary.emailsSent++;
        } else {
          summary.emailsFailed++;
        }
      }
    }

    // Send push notifications to academy owners about upcoming dues
    if (this.pushService) {
      const ownerIds = [...byAcademy.keys()];
      for (const academyId of ownerIds) {
        const academy = await this.academyRepo.findById(academyId);
        if (!academy) continue;
        const dueCount = byAcademy.get(academyId)?.length ?? 0;
        this.pushService
          .sendToUser(academy.ownerUserId, {
            title: 'Fee Reminders Sent',
            body: `${dueCount} fee reminder(s) sent to students for dues on ${targetDueDate}.`,
            data: { type: 'FEE_REMINDER', academyId },
          })
          .catch((pushErr) => {
            this.logger.warn('Failed to send push notification to owner', {
              academyId,
              error: pushErr instanceof Error ? pushErr.message : String(pushErr),
            });
          });
      }
    }

    this.logger.info('Fee reminders: run completed', summary as unknown as Record<string, unknown>);
    return ok(summary);
  }
}
