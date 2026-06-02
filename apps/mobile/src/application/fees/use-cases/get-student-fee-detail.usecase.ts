import type { AppError } from '../../../domain/common/errors';
import type { Result } from '../../../domain/common/result';
import { ok, err } from '../../../domain/common/result';
import type { FeeDueItem } from '../../../domain/fees/fees.types';
import {
  feeDueListResponseSchema,
  type FeeDueListApiResponse,
} from '../../../domain/fees/fees.schemas';

export type GetStudentFeeDetailApiPort = {
  getStudentFees(
    studentId: string,
    from?: string,
    to?: string,
  ): Promise<Result<FeeDueListApiResponse, AppError>>;
};

export type GetStudentFeeDetailDeps = {
  feesApi: GetStudentFeeDetailApiPort;
};

export async function getStudentFeeDetailUseCase(
  deps: GetStudentFeeDetailDeps,
  studentId: string,
  from?: string,
  to?: string,
): Promise<Result<FeeDueItem[], AppError>> {
  // Range omitted by default → API returns the student's full fee history.
  const result = await deps.feesApi.getStudentFees(studentId, from, to);

  if (!result.ok) {
    return result;
  }

  const parsed = feeDueListResponseSchema.safeParse(result.value);
  if (!parsed.success) {
    if (__DEV__) console.error('[getStudentFeeDetailUseCase] Schema parse failed:', parsed.error.issues);
    return err({ code: 'UNKNOWN', message: 'Failed to load fee details. Please try again.' });
  }

  return ok(parsed.data);
}
