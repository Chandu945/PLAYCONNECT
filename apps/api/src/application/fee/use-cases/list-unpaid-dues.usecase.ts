import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import { canViewFees } from '@domain/fee/rules/fee.rules';
import { isValidMonthKey } from '@domain/attendance/value-objects/local-date.vo';
import { FeeErrors } from '../../common/errors';
import type { FeeDueDto } from '../dtos/fee-due.dto';
import { toFeeDueDto } from '../dtos/fee-due.dto';
import type { UserRole, LateFeeConfig, LateFeeRepeatInterval } from '@playconnect/contracts';
import type { ClockPort } from '../../common/clock.port';

export interface ListUnpaidDuesInput {
  actorUserId: string;
  actorRole: UserRole;
  month: string;
}

export class ListUnpaidDuesUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: ListUnpaidDuesInput): Promise<Result<FeeDueDto[], AppError>> {
    const check = canViewFees(input.actorRole);
    if (!check.allowed) return err(FeeErrors.viewNotAllowed());

    if (!isValidMonthKey(input.month)) return err(FeeErrors.invalidMonthKey());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const [dues, academy] = await Promise.all([
      this.feeDueRepo.listByAcademyMonthAndStatuses(user.academyId, input.month, [
        'UPCOMING',
        'DUE',
      ]),
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
