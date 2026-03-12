import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import { canViewSettings } from '@domain/academy/rules/academy.rules';
import { FeeErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';
import {
  DEFAULT_DUE_DATE_DAY,
  DEFAULT_RECEIPT_PREFIX,
  DEFAULT_LATE_FEE_ENABLED,
  DEFAULT_GRACE_PERIOD_DAYS,
  DEFAULT_LATE_FEE_AMOUNT_INR,
  DEFAULT_LATE_FEE_REPEAT_INTERVAL_DAYS,
} from '@playconnect/contracts';

export interface GetAcademySettingsInput {
  actorUserId: string;
  actorRole: UserRole;
}

export interface AcademySettingsDto {
  defaultDueDateDay: number;
  receiptPrefix: string;
  lateFeeEnabled: boolean;
  gracePeriodDays: number;
  lateFeeAmountInr: number;
  lateFeeRepeatIntervalDays: number;
}

export class GetAcademySettingsUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly academyRepo: AcademyRepository,
  ) {}

  async execute(input: GetAcademySettingsInput): Promise<Result<AcademySettingsDto, AppError>> {
    const check = canViewSettings(input.actorRole);
    if (!check.allowed) return err(FeeErrors.settingsViewNotAllowed());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const academy = await this.academyRepo.findById(user.academyId);
    if (!academy) return err(FeeErrors.academyRequired());

    return ok({
      defaultDueDateDay: academy.defaultDueDateDay ?? DEFAULT_DUE_DATE_DAY,
      receiptPrefix: academy.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX,
      lateFeeEnabled: academy.lateFeeEnabled ?? DEFAULT_LATE_FEE_ENABLED,
      gracePeriodDays: academy.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS,
      lateFeeAmountInr: academy.lateFeeAmountInr ?? DEFAULT_LATE_FEE_AMOUNT_INR,
      lateFeeRepeatIntervalDays: academy.lateFeeRepeatIntervalDays ?? DEFAULT_LATE_FEE_REPEAT_INTERVAL_DAYS,
    });
  }
}
