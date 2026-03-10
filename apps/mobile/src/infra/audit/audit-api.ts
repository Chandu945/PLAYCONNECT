import type { AuditLogsQuery } from '../../domain/audit/audit.types';
import type { AuditLogsApiResponse } from '../../domain/audit/audit.schemas';
import type { AppError } from '../../domain/common/errors';
import type { Result } from '../../domain/common/result';
import { apiGet } from '../http/api-client';

export function listAuditLogs(
  query: AuditLogsQuery,
): Promise<Result<AuditLogsApiResponse, AppError>> {
  const parts: string[] = [];
  parts.push(`page=${encodeURIComponent(String(query.page))}`);
  parts.push(`pageSize=${encodeURIComponent(String(query.pageSize))}`);
  if (query.from) parts.push(`from=${encodeURIComponent(query.from)}`);
  if (query.to) parts.push(`to=${encodeURIComponent(query.to)}`);
  if (query.action) parts.push(`action=${encodeURIComponent(query.action)}`);
  if (query.entityType) parts.push(`entityType=${encodeURIComponent(query.entityType)}`);

  return apiGet<AuditLogsApiResponse>(`/api/v1/audit-logs?${parts.join('&')}`);
}

export const auditApi = {
  listAuditLogs,
};
