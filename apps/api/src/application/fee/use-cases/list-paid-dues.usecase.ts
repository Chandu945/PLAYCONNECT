import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import { canViewFees } from '@domain/fee/rules/fee.rules';
import { isValidMonthKey } from '@domain/attendance/value-objects/local-date.vo';
import { FeeErrors } from '../../common/errors';
import type { FeeDueDto } from '../dtos/fee-due.dto';
import { toFeeDueDto } from '../dtos/fee-due.dto';
import type { UserRole } from '@playconnect/contracts';

export interface ListPaidDuesInput {
  actorUserId: string;
  actorRole: UserRole;
  month: string;
}

export class ListPaidDuesUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly feeDueRepo: FeeDueRepository,
  ) {}

  async execute(input: ListPaidDuesInput): Promise<Result<FeeDueDto[], AppError>> {
    const check = canViewFees(input.actorRole);
    if (!check.allowed) return err(FeeErrors.viewNotAllowed());

    if (!isValidMonthKey(input.month)) return err(FeeErrors.invalidMonthKey());

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(FeeErrors.academyRequired());

    const dues = await this.feeDueRepo.listByAcademyMonthPaid(user.academyId, input.month);

    return ok(dues.map((d) => toFeeDueDto(d)));
  }
}
