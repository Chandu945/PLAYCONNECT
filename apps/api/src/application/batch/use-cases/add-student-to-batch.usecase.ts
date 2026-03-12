import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { BatchRepository } from '@domain/batch/ports/batch.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import { StudentBatch } from '@domain/batch/entities/student-batch.entity';
import { BatchErrors, StudentBatchErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';
import { randomUUID } from 'crypto';

export interface AddStudentToBatchInput {
  actorUserId: string;
  actorRole: UserRole;
  batchId: string;
  studentId: string;
}

export class AddStudentToBatchUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly batchRepo: BatchRepository,
    private readonly studentBatchRepo: StudentBatchRepository,
    private readonly studentRepo: StudentRepository,
  ) {}

  async execute(input: AddStudentToBatchInput): Promise<Result<void, AppError>> {
    if (input.actorRole !== 'OWNER' && input.actorRole !== 'STAFF') {
      return err(StudentBatchErrors.manageNotAllowed());
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

    if (batch.status !== 'ACTIVE') {
      return err(BatchErrors.notActive(input.batchId));
    }

    if (batch.maxStudents !== null) {
      const currentCount = await this.studentBatchRepo.countByBatchId(input.batchId);
      if (currentCount >= batch.maxStudents) {
        return err(BatchErrors.capacityFull());
      }
    }

    const student = await this.studentRepo.findById(input.studentId);
    if (!student || student.isDeleted()) {
      return err(StudentBatchErrors.studentNotFound(input.studentId));
    }

    if (student.academyId !== actor.academyId) {
      return err(StudentBatchErrors.studentNotInAcademy());
    }

    const currentAssignments = await this.studentBatchRepo.findByStudentId(input.studentId);

    // Idempotent: if already assigned, return success
    if (currentAssignments.some((a) => a.batchId === input.batchId)) {
      return ok(undefined);
    }

    const newAssignment = StudentBatch.create({
      id: randomUUID(),
      studentId: input.studentId,
      batchId: input.batchId,
      academyId: actor.academyId!,
    });

    await this.studentBatchRepo.replaceForStudent(input.studentId, [
      ...currentAssignments,
      newAssignment,
    ]);

    return ok(undefined);
  }
}
