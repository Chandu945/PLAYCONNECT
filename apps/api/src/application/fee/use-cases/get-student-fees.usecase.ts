import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import { canViewFees } from '@domain/fee/rules/fee.rules';
import { isValidMonthKey } from '@domain/attendance/value-objects/local-date.vo';
import { FeeErrors } from '../../common/errors';
import type { FeeDueDto } from '../dtos/fee-due.dto';
import { toFeeDueDto } from '../dtos/fee-due.dto';
import type { UserRole } from '@academyflo/contracts';
import type { ClockPort } from '../../common/clock.port';
import { formatLocalDate, toMonthKeyFromDate } from '../../../shared/date-utils';
import { buildLateFeeConfigFromAcademy } from '../common/late-fee';

export interface GetStudentFeesInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  /** Optional. When omitted, defaults to the student's joining month so the
   *  full history (incl. older overdue dues) is returned. */
  from?: string;
  /** Optional. When omitted, defaults to the current month. */
  to?: string;
}

export class GetStudentFeesUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: GetStudentFeesInput): Promise<Result<FeeDueDto[], AppError>> {
    const check = canViewFees(input.actorRole);
    if (!check.allowed) return err(FeeErrors.viewNotAllowed());

    // Validate only what the caller actually supplied — the range is optional.
    if (input.from && !isValidMonthKey(input.from)) return err(FeeErrors.invalidMonthKey());
    if (input.to && !isValidMonthKey(input.to)) return err(FeeErrors.invalidMonthKey());
    if (input.from && input.to && input.from > input.to) {
      return err(FeeErrors.invalidMonthRange());
    }

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const student = await this.studentRepo.findById(input.studentId);
    if (!student) return err(FeeErrors.studentNotFound(input.studentId));
    if (student.academyId !== user.academyId) return err(FeeErrors.studentNotInAcademy());

    // Default to the student's FULL history: joining month → current month. A
    // hardcoded calendar-year window previously hid older overdue dues that the
    // fees list still counts, so the detail couldn't reconcile with the list
    // total. Joining month is the true lower bound (no due predates it). The
    // clamp guards against a future joining date (then just show the latest).
    const to = input.to ?? toMonthKeyFromDate(this.clock.now());
    const defaultFrom = toMonthKeyFromDate(student.joiningDate);
    const from = input.from ?? (defaultFrom > to ? to : defaultFrom);

    const [dues, academy] = await Promise.all([
      this.feeDueRepo.listByStudentAndRange(user.academyId, input.studentId, from, to),
      this.academyRepo.findById(user.academyId),
    ]);

    const today = formatLocalDate(this.clock.now());
    const config = buildLateFeeConfigFromAcademy(academy);

    return ok(dues.map((d) => toFeeDueDto(d, config, today, student.fullName)));
  }
}
