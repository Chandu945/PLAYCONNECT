import type { AuditActionType, AuditEntityType } from '@playconnect/contracts';

export type { AuditActionType, AuditEntityType };

export type AuditLogItem = {
  id: string;
  academyId: string;
  actorUserId: string;
  actorName: string | null;
  action: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  context: Record<string, string> | null;
  createdAt: string;
};

export type AuditLogsQuery = {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  action?: AuditActionType;
  entityType?: AuditEntityType;
};
