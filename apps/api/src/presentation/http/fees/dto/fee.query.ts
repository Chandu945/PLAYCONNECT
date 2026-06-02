import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.query';

export class FeesMonthQueryDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  /** Name-prefix search across the entire month — server-side so the
   *  result is complete regardless of pagination state. */
  @IsOptional()
  @IsString()
  search?: string;
}

export class FeesMonthPaginatedQueryDto extends PaginationQueryDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  /** Name-prefix search across the entire month — server-side so the
   *  result is complete regardless of pagination state. */
  @IsOptional()
  @IsString()
  search?: string;
}

export class StudentFeeRangeQueryDto {
  // Both optional: when omitted the API returns the student's FULL history
  // (joining month → current month) so older overdue dues the fees list counts
  // are never hidden by an arbitrary client-chosen window.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'from must be in YYYY-MM format' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'to must be in YYYY-MM format' })
  to?: string;
}
