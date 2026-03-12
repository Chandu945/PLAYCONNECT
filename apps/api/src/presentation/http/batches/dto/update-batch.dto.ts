import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WEEKDAYS } from '@playconnect/contracts';
import type { Weekday } from '@playconnect/contracts';

export class UpdateBatchDto {
  @ApiPropertyOptional({ example: 'Evening Batch' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  batchName?: string;

  @ApiPropertyOptional({ example: ['TUE', 'THU', 'SAT'], enum: [...WEEKDAYS], isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn([...WEEKDAYS], { each: true })
  days?: Weekday[];

  @ApiPropertyOptional({ example: 'Advanced level', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({ example: '06:00', description: 'Start time in HH:mm format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime?: string | null;

  @ApiPropertyOptional({ example: '07:30', description: 'End time in HH:mm format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:mm format' })
  endTime?: string | null;

  @ApiPropertyOptional({ example: 25, description: 'Maximum number of students (null = unlimited)', nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStudents?: number | null;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}
