import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ADMIN_ACADEMY_STATUSES,
  TIER_KEYS,
  AUDIT_ACTION_TYPES,
  AUDIT_ENTITY_TYPES,
} from '@playconnect/contracts';
import type { AdminAcademyStatus, TierKey, AuditActionType, AuditEntityType } from '@playconnect/contracts';
import { PaginationQueryDto } from '../../common/dto/pagination.query';

export class ListAcademiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_ACADEMY_STATUSES })
  @IsOptional()
  @IsIn([...ADMIN_ACADEMY_STATUSES])
  status?: AdminAcademyStatus;

  @ApiPropertyOptional({ description: 'Search by academy name, owner name, email, or phone' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: TIER_KEYS })
  @IsOptional()
  @IsIn([...TIER_KEYS])
  tierKey?: TierKey;
}

export class AdminAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2024-03-01', description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD format' })
  from?: string;

  @ApiPropertyOptional({ example: '2024-03-31', description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD format' })
  to?: string;

  @ApiPropertyOptional({ enum: AUDIT_ACTION_TYPES })
  @IsOptional()
  @IsIn([...AUDIT_ACTION_TYPES])
  action?: AuditActionType;

  @ApiPropertyOptional({ enum: AUDIT_ENTITY_TYPES })
  @IsOptional()
  @IsIn([...AUDIT_ENTITY_TYPES])
  entityType?: AuditEntityType;
}
