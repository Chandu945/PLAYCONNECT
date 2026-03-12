import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import {
  canUpdateSettings,
  validateDefaultDueDateDay,
  validateReceiptPrefix,
  validateGracePeriodDays,
  validateLateFeeAmountInr,
  validateLateFeeRepeatIntervalDays,
} from '@domain/academy/rules/academy.rules';
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

export interface UpdateAcademySettingsInput {
  actorUserId: string;
  actorRole: UserRole;
  defaultDueDateDay?: number;
  receiptPrefix?: string;
  lateFeeEnabled?: boolean;
  gracePeriodDays?: number;
  lateFeeAmountInr?: number;
  lateFeeRepeatIntervalDays?: number;
}

export interface AcademySettingsDto {
  defaultDueDateDay: number;
  receiptPrefix: string;
  lateFeeEnabled: boolean;
  gracePeriodDays: number;
  lateFeeAmountInr: number;
  lateFeeRepeatIntervalDays: number;
}

export class UpdateAcademySettingsUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly academyRepo: AcademyRepository,
  ) {}

  async execute(input: UpdateAcademySettingsInput): Promise<Result<AcademySettingsDto, AppError>> {
    const check = canUpdateSettings(input.actorRole);
    if (!check.allowed) return err(FeeErrors.settingsNotAllowed());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const academy = await this.academyRepo.findById(user.academyId);
    if (!academy) return err(FeeErrors.academyRequired());

    if (input.defaultDueDateDay !== undefined) {
      const dayCheck = validateDefaultDueDateDay(input.defaultDueDateDay);
      if (!dayCheck.valid) return err(AppErrorClass.validation(dayCheck.reason!));
    }

    if (input.receiptPrefix !== undefined) {
      const prefixCheck = validateReceiptPrefix(input.receiptPrefix);
      if (!prefixCheck.valid) return err(AppErrorClass.validation(prefixCheck.reason!));
    }

    if (input.gracePeriodDays !== undefined) {
      const check = validateGracePeriodDays(input.gracePeriodDays);
      if (!check.valid) return err(AppErrorClass.validation(check.reason!));
    }

    if (input.lateFeeAmountInr !== undefined) {
      const check = validateLateFeeAmountInr(input.lateFeeAmountInr);
      if (!check.valid) return err(AppErrorClass.validation(check.reason!));
    }

    if (input.lateFeeRepeatIntervalDays !== undefined) {
      const check = validateLateFeeRepeatIntervalDays(input.lateFeeRepeatIntervalDays);
      if (!check.valid) return err(AppErrorClass.validation(check.reason!));
    }

    const updated = academy.updateSettings({
      defaultDueDateDay: input.defaultDueDateDay,
      receiptPrefix: input.receiptPrefix,
      lateFeeEnabled: input.lateFeeEnabled,
      gracePeriodDays: input.gracePeriodDays,
      lateFeeAmountInr: input.lateFeeAmountInr,
      lateFeeRepeatIntervalDays: input.lateFeeRepeatIntervalDays,
    });

    await this.academyRepo.save(updated);

    return ok({
      defaultDueDateDay: updated.defaultDueDateDay ?? DEFAULT_DUE_DATE_DAY,
      receiptPrefix: updated.receiptPrefix ?? DEFAULT_RECEIPT_PREFIX,
      lateFeeEnabled: updated.lateFeeEnabled ?? DEFAULT_LATE_FEE_ENABLED,
      gracePeriodDays: updated.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS,
      lateFeeAmountInr: updated.lateFeeAmountInr ?? DEFAULT_LATE_FEE_AMOUNT_INR,
      lateFeeRepeatIntervalDays: updated.lateFeeRepeatIntervalDays ?? DEFAULT_LATE_FEE_REPEAT_INTERVAL_DAYS,
    });
  }
}
