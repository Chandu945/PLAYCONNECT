import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import { canViewReports } from '@domain/fee/rules/fee.rules';
import { isValidMonthKey } from '@domain/attendance/value-objects/local-date.vo';
import { FeeErrors } from '../../common/errors';
import type { StudentWiseDueItemDto } from '../dtos/student-wise-dues.dto';
import type { UserRole, FeeDueStatus } from '@academyflo/contracts';
import type { ClockPort } from '../../common/clock.port';
import { formatLocalDate } from '../../../shared/date-utils';
import { buildLateFeeConfigFromAcademy, lateFeeForUnpaidDue } from '../../fee/common/late-fee';

// "Pending" means unpaid. This is the same UPCOMING/DUE set used by
// listUnpaidByAcademy and the dashboard's pending tiles — a PAID due is never
// pending, so it must not appear in the Pending Dues report nor in its total.
const UNPAID_DUE_STATUSES: FeeDueStatus[] = ['UPCOMING', 'DUE'];

export interface GetStudentWiseDuesReportInput {
  actorUserId: string;
  actorRole: UserRole;
  month: string;
  page: number;
  pageSize: number;
}

export interface StudentWiseDuesReportOutput {
  items: StudentWiseDueItemDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class GetStudentWiseDuesReportUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly clock: ClockPort,
  ) {}

  async execute(
    input: GetStudentWiseDuesReportInput,
  ): Promise<Result<StudentWiseDuesReportOutput, AppError>> {
    const check = canViewReports(input.actorRole);
    if (!check.allowed) return err(FeeErrors.reportsNotAllowed());

    if (!isValidMonthKey(input.month)) return err(FeeErrors.invalidMonthKey());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const academyId = user.academyId;

    // Only unpaid (UPCOMING/DUE) dues for the selected month belong in a
    // "Pending Dues" report — paid students must not appear or be totalled.
    // We also load all unpaid dues across months to show each student's
    // cross-month backlog (pendingMonthsCount / totalPendingAmount).
    const [monthDues, allUnpaid, academy] = await Promise.all([
      this.feeDueRepo.listByAcademyMonthAndStatuses(academyId, input.month, UNPAID_DUE_STATUSES),
      this.feeDueRepo.listUnpaidByAcademy(academyId),
      this.academyRepo.findById(academyId),
    ]);

    // Late-fee config resolved once; per-due late fee mirrors the dashboard,
    // month-wise report, and parent views so all dues surfaces agree.
    const liveConfig = buildLateFeeConfigFromAcademy(academy);
    const todayStr = formatLocalDate(this.clock.now());

    // Build unpaid aggregation per student — total owed includes late fees.
    const unpaidByStudent = new Map<string, { count: number; totalAmount: number }>();
    for (const due of allUnpaid) {
      const existing = unpaidByStudent.get(due.studentId) ?? { count: 0, totalAmount: 0 };
      existing.count += 1;
      existing.totalAmount += due.amount + lateFeeForUnpaidDue(due, liveConfig, todayStr);
      unpaidByStudent.set(due.studentId, existing);
    }

    // Load student names in batch (instead of one-by-one)
    const studentIds = [...new Set(monthDues.map((d) => d.studentId))];
    const students = await this.studentRepo.findByIds(studentIds);
    const studentMap = new Map<string, string>();
    for (const student of students) {
      studentMap.set(student.id.toString(), student.fullName);
    }

    const allItems: StudentWiseDueItemDto[] = monthDues.map((due) => {
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

    // Paginate
    const total = allItems.length;
    const totalPages = Math.ceil(total / input.pageSize);
    const start = (input.page - 1) * input.pageSize;
    const items = allItems.slice(start, start + input.pageSize);

    return ok({
      items,
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages,
      },
    });
  }
}
