import type {
  StudentListFilters,
  StudentListItem,
  CreateStudentRequest,
  UpdateStudentRequest,
  ChangeStudentStatusRequest,
  StudentCredentials,
  InviteParentResponse,
} from '../../domain/student/student.types';
import type { StudentListApiResponse } from '../../domain/student/student.schemas';
import type { AppError } from '../../domain/common/errors';
import type { Result } from '../../domain/common/result';
import { apiGet, apiPost, apiPatch, apiDelete } from '../http/api-client';

function buildListPath(filters: StudentListFilters, page: number, pageSize: number): string {
  const parts: string[] = [`page=${page}`, `pageSize=${pageSize}`];

  if (filters.status) parts.push(`status=${encodeURIComponent(filters.status)}`);
  if (filters.search) parts.push(`search=${encodeURIComponent(filters.search)}`);
  if (filters.feeFilter) parts.push(`feeFilter=${encodeURIComponent(filters.feeFilter)}`);
  if (filters.month) parts.push(`month=${encodeURIComponent(filters.month)}`);
  if (filters.batchId) parts.push(`batchId=${encodeURIComponent(filters.batchId)}`);

  return `/api/v1/students?${parts.join('&')}`;
}

export function listStudents(
  filters: StudentListFilters,
  page: number,
  pageSize: number,
): Promise<Result<StudentListApiResponse, AppError>> {
  return apiGet<StudentListApiResponse>(buildListPath(filters, page, pageSize));
}

export function createStudent(req: CreateStudentRequest): Promise<Result<unknown, AppError>> {
  return apiPost('/api/v1/students', req);
}

export function updateStudent(
  id: string,
  req: UpdateStudentRequest,
): Promise<Result<unknown, AppError>> {
  return apiPatch(`/api/v1/students/${id}`, req);
}

export function getStudent(id: string): Promise<Result<StudentListItem, AppError>> {
  return apiGet<StudentListItem>(`/api/v1/students/${id}`);
}

export function deleteStudent(id: string): Promise<Result<unknown, AppError>> {
  return apiDelete(`/api/v1/students/${id}`);
}

export function changeStudentStatus(
  id: string,
  req: ChangeStudentStatusRequest,
): Promise<Result<unknown, AppError>> {
  return apiPatch(`/api/v1/students/${id}/status`, req);
}

export function getStudentCredentials(
  id: string,
): Promise<Result<StudentCredentials, AppError>> {
  return apiGet<StudentCredentials>(`/api/v1/students/${id}/credentials`);
}

export function getStudentDocumentUrl(
  id: string,
  docType: 'report' | 'registration-form' | 'id-card',
  params?: { fromMonth?: string; toMonth?: string },
): string {
  let path = `/api/v1/students/${id}/documents/${docType}`;
  if (params?.fromMonth || params?.toMonth) {
    const qs = new URLSearchParams();
    if (params.fromMonth) qs.set('fromMonth', params.fromMonth);
    if (params.toMonth) qs.set('toMonth', params.toMonth);
    path += `?${qs.toString()}`;
  }
  return path;
}

export function inviteParent(
  studentId: string,
): Promise<Result<InviteParentResponse, AppError>> {
  return apiPost<InviteParentResponse>(`/api/v1/students/${encodeURIComponent(studentId)}/invite-parent`, {});
}

export function getStudentPhotoUploadPath(id: string): string {
  return `/api/v1/students/${id}/photo`;
}

export const studentApi = {
  listStudents, getStudent, createStudent, updateStudent, deleteStudent,
  changeStudentStatus, getStudentCredentials, getStudentDocumentUrl,
  getStudentPhotoUploadPath, inviteParent,
};
