import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { AcademyRepository } from '@domain/academy/ports/academy.repository';
import { canViewOwnChildren } from '@domain/parent/rules/parent.rules';
import { ParentErrors } from '../../common/errors';
import type { ChildFeeDueDto } from '../dtos/parent.dto';
import type { UserRole, LateFeeConfig, LateFeeRepeatInterval } from '@playconnect/contracts';
import { computeLateFee } from '@playconnect/contracts';
import type { ClockPort } from '../../common/clock.port';

export interface GetChildFeesInput {
  parentUserId: string;
  parentRole: UserRole;
  studentId: string;
  from: string;
  to: string;
}

export class GetChildFeesUseCase {
  constructor(
    private readonly linkRepo: ParentStudentLinkRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly academyRepo: AcademyRepository,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: GetChildFeesInput): Promise<Result<ChildFeeDueDto[], AppError>> {
    const check = canViewOwnChildren(input.parentRole);
    if (!check.allowed) return err(ParentErrors.childNotLinked());

    const link = await this.linkRepo.findByParentAndStudent(input.parentUserId, input.studentId);
    if (!link) return err(ParentErrors.childNotLinked());

    const [dues, academy] = await Promise.all([
      this.feeDueRepo.listByStudentAndRange(
        link.academyId,
        input.studentId,
        input.from,
        input.to,
      ),
      this.academyRepo.findById(link.academyId),
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

    const dtos: ChildFeeDueDto[] = dues.map((d) => {
      let lateFee = 0;
      if (d.status === 'PAID') {
        lateFee = d.lateFeeApplied ?? 0;
      } else {
        const effectiveConfig = d.lateFeeConfigSnapshot ?? config;
        if (effectiveConfig) {
          lateFee = computeLateFee(d.dueDate, today, effectiveConfig);
        }
      }
      return {
        id: d.id.toString(),
        studentId: d.studentId,
        monthKey: d.monthKey,
        dueDate: d.dueDate,
        amount: d.amount,
        lateFee,
        totalPayable: d.amount + lateFee,
        status: d.status,
        paidAt: d.paidAt ? d.paidAt.toISOString() : null,
        paidSource: d.paidSource,
        paymentLabel: d.paymentLabel,
      };
    });

    return ok(dtos);
  }
}
