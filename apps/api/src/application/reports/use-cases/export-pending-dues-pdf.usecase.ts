import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { PdfRenderer } from '../ports/pdf-renderer.port';
import { canViewReports } from '@domain/fee/rules/fee.rules';
import { isValidMonthKey } from '@domain/attendance/value-objects/local-date.vo';
import { FeeErrors } from '../../common/errors';
import type { StudentWiseDueItemDto } from '../dtos/student-wise-dues.dto';
import type { UserRole, FeeDueStatus } from '@academyflo/contracts';
import type { ClockPort } from '../../common/clock.port';
import { formatLocalDate } from '../../../shared/date-utils';
import { buildLateFeeConfigFromAcademy, lateFeeForUnpaidDue } from '../../fee/common/late-fee';

// "Pending" means unpaid (UPCOMING/DUE). Paid dues must not appear in the
// Pending Dues PDF nor feed into its "Total Pending" sum. Mirrors
// get-student-wise-dues-report.usecase.ts.
const UNPAID_DUE_STATUSES: FeeDueStatus[] = ['UPCOMING', 'DUE'];

export interface ExportPendingDuesPdfInput {
  actorUserId: string;
  actorRole: UserRole;
  month: string;
}

export class ExportPendingDuesPdfUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly pdfRenderer: PdfRenderer,
    private readonly academyRepo: AcademyRepository,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: ExportPendingDuesPdfInput): Promise<Result<Buffer, AppError>> {
    const check = canViewReports(input.actorRole);
    if (!check.allowed) return err(FeeErrors.reportsNotAllowed());

    if (!isValidMonthKey(input.month)) return err(FeeErrors.invalidMonthKey());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const academyId = user.academyId;

    const [monthDues, allUnpaidRaw, academy] = await Promise.all([
      this.feeDueRepo.listByAcademyMonthAndStatuses(academyId, input.month, UNPAID_DUE_STATUSES),
      this.feeDueRepo.listUnpaidByAcademy(academyId),
      this.academyRepo.findById(academyId),
    ]);

    // Late-fee config resolved once; per-due late fee matches the dashboard /
    // month-wise report / parent views so the PDF totals agree with them.
    const liveConfig = buildLateFeeConfigFromAcademy(academy);
    const todayStr = formatLocalDate(this.clock.now());

    // Sanity cap: a runaway academy with 50k+ unpaid dues would OOM the PDF
    // path. Truncate and log so we degrade rather than crash; product can
    // tighten if this ever fires legitimately.
    const MAX_UNPAID_ROWS = 5000;
    if (allUnpaidRaw.length > MAX_UNPAID_ROWS) {
      console.warn(
        `[export-pending-dues-pdf] academy=${academyId} unpaid=${allUnpaidRaw.length} > cap=${MAX_UNPAID_ROWS}; truncating`,
      );
    }
    const allUnpaid = allUnpaidRaw.slice(0, MAX_UNPAID_ROWS);

    const unpaidByStudent = new Map<string, { count: number; totalAmount: number }>();
    for (const due of allUnpaid) {
      const existing = unpaidByStudent.get(due.studentId) ?? { count: 0, totalAmount: 0 };
      existing.count += 1;
      existing.totalAmount += due.amount + lateFeeForUnpaidDue(due, liveConfig, todayStr);
      unpaidByStudent.set(due.studentId, existing);
    }

    // Batch student lookups to avoid N+1 — a 200-student academy was making
    // 200 sequential findById calls and timing out the PDF endpoint.
    const studentIds = [...new Set(monthDues.map((d) => d.studentId))];
    const students = await this.studentRepo.findByIds(studentIds);
    const studentMap = new Map<string, string>(
      students.map((s) => [s.id.toString(), s.fullName]),
    );

    const items: StudentWiseDueItemDto[] = monthDues.map((due) => {
      const unpaid = unpaidByStudent.get(due.studentId) ?? { count: 0, totalAmount: 0 };
      const lateFee = lateFeeForUnpaidDue(due, liveConfig, todayStr);
      return {
        studentId: due.studentId,
        studentName: studentMap.get(due.studentId) ?? 'Unknown',
        monthKey: due.monthKey,
        amount: due.amount,
        lateFee,
        totalPayable: due.amount + lateFee,
        status: due.status,
        pendingMonthsCount: unpaid.count,
        totalPendingAmount: unpaid.totalAmount,
      };
    });

    const pdf = await this.pdfRenderer.renderPendingDues(input.month, items);

    return ok(pdf);
  }
}
