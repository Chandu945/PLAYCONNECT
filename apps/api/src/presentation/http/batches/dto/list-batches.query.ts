import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.query';

export class ListBatchesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search batches by name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
