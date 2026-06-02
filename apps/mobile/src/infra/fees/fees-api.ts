import {
  feeDueItemSchema,
  feeDueListResponseSchema,
  feeDuePaginatedResponseSchema,
  type FeeDueListApiResponse,
  type FeeDuePaginatedApiResponse,
} from '../../domain/fees/fees.schemas';
import type { FeeDueItem } from '../../domain/fees/fees.types';
import type { OverdueStudentsResult } from '../../domain/fees/overdue.types';
import type { AppError } from '../../domain/common/errors';
import { err, ok, type Result } from '../../domain/common/result';
import { apiGet, apiPut } from '../http/api-client';
import type { ZodSchema } from 'zod';

function validateResponse<T>(
  schema: ZodSchema<T>,
  result: Result<unknown, AppError>,
  label: string,
): Result<T, AppError> {
  if (!result.ok) return result;
  const parsed = schema.safeParse(result.value);
  if (!parsed.success) {
    if (__DEV__) {
      console.error(`[feesApi] ${label} schema mismatch:`, parsed.error.issues);
    }
    return err({ code: 'UNKNOWN', message: 'Unexpected server response' });
  }
  return ok(parsed.data);
}

export async function listUnpaidDues(
  month: string,
  page: number = 1,
  pageSize: number = 20,
  batchId?: string,
  search?: string,
): Promise<Result<FeeDuePaginatedApiResponse, AppError>> {
  const parts = [`month=${encodeURIComponent(month)}`, `page=${page}`, `pageSize=${pageSize}`];
  if (batchId) parts.push(`batchId=${encodeURIComponent(batchId)}`);
  if (search) parts.push(`search=${encodeURIComponent(search)}`);
  const result = await apiGet<unknown>(`/api/v1/fees/dues?${parts.join('&')}`);
  return validateResponse(
    feeDuePaginatedResponseSchema as unknown as ZodSchema<FeeDuePaginatedApiResponse>,
    result,
    'listUnpaidDues',
  );
}

export async function listPaidDues(
  month: string,
  batchId?: string,
  search?: string,
): Promise<Result<FeeDueListApiResponse, AppError>> {
  const parts = [`month=${encodeURIComponent(month)}`];
  if (batchId) parts.push(`batchId=${encodeURIComponent(batchId)}`);
  if (search) parts.push(`search=${encodeURIComponent(search)}`);
  const result = await apiGet<unknown>(`/api/v1/fees/paid?${parts.join('&')}`);
  return validateResponse(
    feeDueListResponseSchema as unknown as ZodSchema<FeeDueListApiResponse>,
    result,
    'listPaidDues',
  );
}

export async function getStudentFees(
  studentId: string,
  from?: string,
  to?: string,
): Promise<Result<FeeDueListApiResponse, AppError>> {
  // Range is optional — omit it to get the student's full history (joining
  // month → current month), so older overdue dues are never hidden.
  const params = [
    from ? `from=${encodeURIComponent(from)}` : null,
    to ? `to=${encodeURIComponent(to)}` : null,
  ]
    .filter(Boolean)
    .join('&');
  const url = `/api/v1/fees/students/${studentId}${params ? `?${params}` : ''}`;
  const result = await apiGet<unknown>(url);
  return validateResponse(
    feeDueListResponseSchema as unknown as ZodSchema<FeeDueListApiResponse>,
    result,
    'getStudentFees',
  );
}

export async function markFeePaid(
  studentId: string,
  month: string,
  paymentLabel?: string,
): Promise<Result<FeeDueItem, AppError>> {
  const result = await apiPut<unknown>(
    `/api/v1/fees/students/${studentId}/${month}/pay`,
    paymentLabel ? { paymentLabel } : undefined,
  );
  return validateResponse(
    feeDueItemSchema as unknown as ZodSchema<FeeDueItem>,
    result,
    'markFeePaid',
  );
}

// getOverdueStudents returns OverdueStudentsResult which has no Zod schema in
// the domain yet. Leaving it as a bare typed call until a schema lands; this
// endpoint is admin-only and lower-traffic than the list endpoints above.
export function getOverdueStudents(): Promise<Result<OverdueStudentsResult, AppError>> {
  return apiGet<OverdueStudentsResult>('/api/v1/fees/overdue');
}

export const feesApi = { listUnpaidDues, listPaidDues, getStudentFees, markFeePaid, getOverdueStudents };
