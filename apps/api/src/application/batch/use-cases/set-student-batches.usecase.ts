import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { StudentBatch } from '@domain/batch/entities/student-batch.entity';
import { BatchErrors, StudentBatchErrors } from '../../common/errors';
import type { BatchDto } from '../dtos/batch.dto';
import { toBatchDto } from '../dtos/batch.dto';
import type { UserRole } from '@playconnect/contracts';
import { randomUUID } from 'crypto';

export interface SetStudentBatchesInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  batchIds: string[];
}

export class SetStudentBatchesUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly batchRepo: BatchRepository,
    private readonly studentBatchRepo: StudentBatchRepository,
  ) {}

  async execute(input: SetStudentBatchesInput): Promise<Result<BatchDto[], AppError>> {
    if (input.actorRole !== 'OWNER' && input.actorRole !== 'STAFF') {
      return err(StudentBatchErrors.manageNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(StudentBatchErrors.academyRequired());
    }

    const student = await this.studentRepo.findById(input.studentId);
    if (!student || student.isDeleted()) {
      return err(StudentBatchErrors.studentNotFound(input.studentId));
    }

    if (student.academyId !== actor.academyId) {
      return err(StudentBatchErrors.studentNotInAcademy());
    }

    // Deduplicate
    const uniqueBatchIds = [...new Set(input.batchIds)];

    // Validate all batches exist and belong to same academy
    const batches = await Promise.all(
      uniqueBatchIds.map((id) => this.batchRepo.findById(id)),
    );

    for (let i = 0; i < uniqueBatchIds.length; i++) {
      const batch = batches[i];
      if (!batch || batch.academyId !== actor.academyId) {
        return err(StudentBatchErrors.batchNotInAcademy(uniqueBatchIds[i]!));
      }
      if (batch.status !== 'ACTIVE') {
        return err(BatchErrors.notActive(uniqueBatchIds[i]!));
      }
    }

    // Build new assignments
    const assignments = uniqueBatchIds.map((batchId) =>
      StudentBatch.create({
        id: randomUUID(),
        studentId: input.studentId,
        batchId,
        academyId: actor.academyId!,
      }),
    );

    await this.studentBatchRepo.replaceForStudent(input.studentId, assignments);

    return ok(batches.filter((b): b is NonNullable<typeof b> => b !== null).map(toBatchDto));
  }
}
