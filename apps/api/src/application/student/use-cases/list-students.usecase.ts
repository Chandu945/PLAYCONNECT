import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentQueryRepository } from '@domain/student/ports/student-query.repository';
import type { StudentBatchRepository } from '@domain/batch/ports/student-batch.repository';
import { canManageStudent } from '@domain/student/rules/student.rules';
import { StudentErrors } from '../../common/errors';
import type { StudentDto } from '../dtos/student.dto';
import { toStudentDto, toStudentDtoFromRow } from '../dtos/student.dto';
import type { FeeFilter, StudentStatus, UserRole } from '@playconnect/contracts';

export interface ListStudentsInput {
  actorUserId: string;
  actorRole: UserRole;
  page: number;
  pageSize: number;
  status?: StudentStatus;
  search?: string;
  feeFilter?: FeeFilter;
  month?: string;
  batchId?: string;
}

export interface ListStudentsOutput {
  data: StudentDto[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export class ListStudentsUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly studentQueryRepo?: StudentQueryRepository,
    private readonly studentBatchRepo?: StudentBatchRepository,
  ) {}

  async execute(input: ListStudentsInput): Promise<Result<ListStudentsOutput, AppError>> {
    const roleCheck = canManageStudent(input.actorRole);
    if (!roleCheck.allowed) {
      return err(StudentErrors.manageNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(StudentErrors.academyRequired());
    }

    // Resolve student IDs for batch filter
    let batchStudentIds: string[] | undefined;
    if (input.batchId && this.studentBatchRepo) {
      const assignments = await this.studentBatchRepo.findByBatchId(input.batchId);
      batchStudentIds = assignments.map((a) => a.studentId);
      if (batchStudentIds.length === 0) {
        return ok({
          data: [],
          meta: { page: input.page, pageSize: input.pageSize, totalItems: 0, totalPages: 0 },
        });
      }
    }

    if (input.feeFilter && input.feeFilter !== 'ALL' && this.studentQueryRepo) {
      const { rows, total } = await this.studentQueryRepo.listWithFeeFilter(
        {
          academyId: actor.academyId,
          status: input.status,
          search: input.search,
          feeFilter: input.feeFilter,
          month: input.month,
          studentIds: batchStudentIds,
        },
        input.page,
        input.pageSize,
      );

      return ok({
        data: rows.map(toStudentDtoFromRow),
        meta: {
          page: input.page,
          pageSize: input.pageSize,
          totalItems: total,
          totalPages: Math.ceil(total / input.pageSize),
        },
      });
    }

    const { students, total } = await this.studentRepo.list(
      {
        academyId: actor.academyId,
        status: input.status,
        search: input.search,
        studentIds: batchStudentIds,
      },
      input.page,
      input.pageSize,
    );

    return ok({
      data: students.map(toStudentDto),
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    });
  }
}
