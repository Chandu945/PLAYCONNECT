import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { TransactionPort } from '../../common/transaction.port';
import { BatchErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';

export interface DeleteBatchInput {
  actorUserId: string;
  actorRole: UserRole;
  batchId: string;
}

export class DeleteBatchUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly batchRepo: BatchRepository,
    private readonly studentBatchRepo: StudentBatchRepository,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(input: DeleteBatchInput): Promise<Result<{ deleted: true }, AppError>> {
    if (input.actorRole !== 'OWNER') {
      return err(BatchErrors.deleteNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(BatchErrors.academyRequired());
    }

    const batch = await this.batchRepo.findById(input.batchId);
    if (!batch) {
      return err(BatchErrors.notFound(input.batchId));
    }

    if (batch.academyId !== actor.academyId) {
      return err(BatchErrors.notInAcademy());
    }

    // Cascade: unassign all students from this batch, then delete batch atomically
    await this.transaction.run(async () => {
      await this.studentBatchRepo.deleteByBatchId(input.batchId);
      await this.batchRepo.deleteById(input.batchId);
    });

    return ok({ deleted: true as const });
  }
}
