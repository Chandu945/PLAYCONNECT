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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WEEKDAYS } from '@playconnect/contracts';
import type { Weekday } from '@playconnect/contracts';

export class CreateBatchDto {
  @ApiProperty({ example: 'Morning Batch' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  batchName!: string;

  @ApiPropertyOptional({ example: ['MON', 'WED', 'FRI'], enum: [...WEEKDAYS], isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn([...WEEKDAYS], { each: true })
  days?: Weekday[];

  @ApiPropertyOptional({ example: 'Beginner level, ages 5-8' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ example: '06:00', description: 'Start time in HH:mm format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime?: string;

  @ApiPropertyOptional({ example: '07:30', description: 'End time in HH:mm format' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:mm format' })
  endTime?: string;

  @ApiPropertyOptional({ example: 25, description: 'Maximum number of students (null = unlimited)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStudents?: number;
}
