import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import { canViewFees } from '@domain/fee/rules/fee.rules';
import { isValidMonthKey } from '@domain/attendance/value-objects/local-date.vo';
import { FeeErrors } from '../../common/errors';
import type { FeeDueDto } from '../dtos/fee-due.dto';
import { toFeeDueDto } from '../dtos/fee-due.dto';
import type { UserRole } from '@playconnect/contracts';

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

    const dues = await this.feeDueRepo.listByStudentAndRange(
      user.academyId,
      input.studentId,
      input.from,
      input.to,
    );

    return ok(dues.map(toFeeDueDto));
  }
}
