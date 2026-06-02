import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { Student } from '@domain/student/entities/student.entity';
import { canViewFees } from '@domain/fee/rules/fee.rules';
import { isValidMonthKey } from '@domain/attendance/value-objects/local-date.vo';
import { FeeErrors } from '../../common/errors';
import type { FeeDueDto } from '../dtos/fee-due.dto';
import { toFeeDueDto } from '../dtos/fee-due.dto';
import type { UserRole } from '@academyflo/contracts';
import type { ClockPort } from '../../common/clock.port';
import { formatLocalDate } from '../../../shared/date-utils';
import { buildLateFeeConfigFromAcademy } from '../common/late-fee';

/** Project a Student entity down to the fields the unpaid-dues row needs: the
 *  display name and a single contact phone (mobile → guardian → WhatsApp). */
function toStudentRow(s: Student): { name: string; phone: string | null } {
  return {
    name: s.fullName,
    phone: s.mobileNumber ?? s.guardian?.mobile ?? s.whatsappNumber ?? null,
  };
}

export interface ListUnpaidDuesInput {
  actorUserId: string;
  actorRole: UserRole;
  month: string;
  page: number;
  pageSize: number;
  batchId?: string;
  /** Optional name-prefix filter. When set, the use case resolves matching
   *  students via the student repo (prefix match on `fullNameNormalized`)
   *  and narrows the dues list to those student ids before paginating, so
   *  search returns complete results across the entire month — not just
   *  the page already loaded on the client. */
  search?: string;
}

/** Unpaid-dues row = the shared fee-due DTO plus two list-specific fields:
 *  the student's contact phone and their total number of unpaid months. */
export interface UnpaidDueDto extends FeeDueDto {
  studentPhone: string | null;
  unpaidMonthsCount: number;
  /** Total amount the student owes across ALL unpaid months (base + live late
   *  fee), not just the listed month's due. Lets the row show the real total. */
  studentTotalOutstanding: number;
}

export interface ListUnpaidDuesOutput {
  items: UnpaidDueDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export class ListUnpaidDuesUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly clock: ClockPort,
    private readonly studentRepo?: StudentRepository,
    private readonly studentBatchRepo?: StudentBatchRepository,
  ) {}

  async execute(input: ListUnpaidDuesInput): Promise<Result<ListUnpaidDuesOutput, AppError>> {
    const check = canViewFees(input.actorRole);
    if (!check.allowed) return err(FeeErrors.viewNotAllowed());

    if (!isValidMonthKey(input.month)) return err(FeeErrors.invalidMonthKey());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const [dues, academy, allUnpaidDues] = await Promise.all([
      this.feeDueRepo.listByAcademyMonthAndStatuses(user.academyId, input.month, [
        'UPCOMING',
        'DUE',
      ]),
      this.academyRepo.findById(user.academyId),
      // ALL unpaid dues across every month (not just `input.month`), so each
      // row can report the student's total unpaid months AND total amount owed.
      this.feeDueRepo.listUnpaidByAcademy(user.academyId),
    ]);

    const today = formatLocalDate(this.clock.now());
    const config = buildLateFeeConfigFromAcademy(academy);

    // Per-student aggregates over every unpaid month:
    //  - count       → the "N months due" badge
    //  - outstanding → base + live late fee, summed, so the row shows the real
    //    total owed across all unpaid months, not just the listed month's due.
    //    Late fee is computed dynamically (toFeeDueDto), so a plain DB sum of
    //    `amount` would understate it — we sum the projected totalPayable here.
    const unpaidCountsByStudent: Record<string, number> = {};
    const outstandingByStudent: Record<string, number> = {};
    for (const due of allUnpaidDues) {
      unpaidCountsByStudent[due.studentId] = (unpaidCountsByStudent[due.studentId] ?? 0) + 1;
      outstandingByStudent[due.studentId] =
        (outstandingByStudent[due.studentId] ?? 0) + toFeeDueDto(due, config, today).totalPayable;
    }

    // Hide dues for soft-deleted students. They're preserved in the DB
    // (financial audit) but rendering them on the active dues list creates
    // unactionable "ghost rows" — no name, no avatar, can't be marked paid
    // because the student record is gone. studentRepo.findByIds already
    // filters deletedAt:null at the DB layer, so the returned set is the
    // alive-students subset; everything else is treated as deleted.
    let filteredDues = dues;
    let aliveStudentsById = new Map<string, ReturnType<typeof toStudentRow>>();
    if (this.studentRepo && dues.length > 0) {
      const uniqueIds = [...new Set(dues.map((d) => d.studentId))];
      const aliveStudents = await this.studentRepo.findByIds(uniqueIds);
      aliveStudentsById = new Map(
        aliveStudents.map((s) => [s.id.toString(), toStudentRow(s)]),
      );
      filteredDues = dues.filter((d) => aliveStudentsById.has(d.studentId));
    }

    // Filter by batch if requested
    if (input.batchId && this.studentBatchRepo) {
      const batchAssignments = await this.studentBatchRepo.findByBatchId(input.batchId);
      const batchStudentIds = new Set(batchAssignments.map((a) => a.studentId));
      filteredDues = filteredDues.filter((d) => batchStudentIds.has(d.studentId));
    }

    // Filter by name search if requested. Reuses the existing student.list
    // search path (prefix match on `fullNameNormalized`) so the UX is
    // consistent with the students screen. Capped at 1000 hits — academies
    // exceeding that with a single prefix are extreme outliers; if it
    // becomes a real concern we'll add a dedicated `findIdsByNameLike`.
    const trimmedSearch = input.search?.trim();
    if (trimmedSearch && this.studentRepo) {
      const { students } = await this.studentRepo.list(
        { academyId: user.academyId, search: trimmedSearch },
        1,
        1000,
      );
      const matchedIds = new Set(students.map((s) => s.id.toString()));
      filteredDues = filteredDues.filter((d) => matchedIds.has(d.studentId));
    }

    const total = filteredDues.length;
    const { page, pageSize } = input;
    const start = (page - 1) * pageSize;
    const paged = filteredDues.slice(start, start + pageSize);

    // Each row reuses the alive-students projection fetched above (name +
    // phone) and the academy-wide unpaid-month counts — no per-row re-query.
    return ok({
      items: paged.map((d) => {
        const row = aliveStudentsById.get(d.studentId);
        return {
          ...toFeeDueDto(d, config, today, row?.name),
          studentPhone: row?.phone ?? null,
          unpaidMonthsCount: unpaidCountsByStudent[d.studentId] ?? 0,
          studentTotalOutstanding: outstandingByStudent[d.studentId] ?? 0,
        };
      }),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }
}
