import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.query';

export class AttendanceQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: '2024-03-15', description: 'YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD format' })
  date!: string;

  @ApiPropertyOptional({ description: 'Filter students by batch' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Search students by name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  override pageSize: number = 50;
}

export class DateOnlyQueryDto {
  @ApiProperty({ example: '2024-03-15', description: 'YYYY-MM-DD' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD format' })
  date!: string;
}
