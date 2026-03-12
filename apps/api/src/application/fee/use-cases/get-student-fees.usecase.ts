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
import type { UserRole, LateFeeConfig, LateFeeRepeatInterval } from '@playconnect/contracts';
import type { ClockPort } from '../../common/clock.port';

export interface GetStudentFeesInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  from: string;
  to: string;
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

    if (!isValidMonthKey(input.from) || !isValidMonthKey(input.to)) {
      return err(FeeErrors.invalidMonthKey());
    }

    if (input.from > input.to) {
      return err(FeeErrors.invalidMonthRange());
    }

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const student = await this.studentRepo.findById(input.studentId);
    if (!student) return err(FeeErrors.studentNotFound(input.studentId));
    if (student.academyId !== user.academyId) return err(FeeErrors.studentNotInAcademy());

    const [dues, academy] = await Promise.all([
      this.feeDueRepo.listByStudentAndRange(
        user.academyId,
        input.studentId,
        input.from,
        input.to,
      ),
      this.academyRepo.findById(user.academyId),
    ]);

    const today = this.clock.now().toISOString().slice(0, 10);
    const config: LateFeeConfig | undefined = academy?.lateFeeEnabled
      ? {
          lateFeeEnabled: academy.lateFeeEnabled,
          gracePeriodDays: academy.gracePeriodDays,
          lateFeeAmountInr: academy.lateFeeAmountInr,
          lateFeeRepeatIntervalDays: academy.lateFeeRepeatIntervalDays as LateFeeRepeatInterval,
        }
      : undefined;

    return ok(dues.map((d) => toFeeDueDto(d, config, today)));
  }
}
