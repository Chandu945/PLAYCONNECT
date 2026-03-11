import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StudentReportQueryDto {
  @ApiPropertyOptional({ example: '2024-01', description: 'From month in YYYY-MM format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fromMonth must be YYYY-MM format' })
  fromMonth?: string;

  @ApiPropertyOptional({ example: '2024-03', description: 'To month in YYYY-MM format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'toMonth must be YYYY-MM format' })
  toMonth?: string;
}
