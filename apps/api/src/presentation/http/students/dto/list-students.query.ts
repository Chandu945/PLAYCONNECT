import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.query';

export class ListStudentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'LEFT'] })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE', 'LEFT'])
  status?: 'ACTIVE' | 'INACTIVE' | 'LEFT';

  @ApiPropertyOptional({ description: 'Prefix search on student name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['ALL', 'DUE', 'PAID'] })
  @IsOptional()
  @IsIn(['ALL', 'DUE', 'PAID'])
  feeFilter?: 'ALL' | 'DUE' | 'PAID';

  @ApiPropertyOptional({ description: 'Month in YYYY-MM format for fee filtering' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM format' })
  month?: string;
}
