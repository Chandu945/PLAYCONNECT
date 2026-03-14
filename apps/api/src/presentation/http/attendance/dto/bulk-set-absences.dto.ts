import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkSetAbsencesDto {
  @ApiProperty({
    example: ['student-1', 'student-2'],
    description: 'List of absent student IDs. Empty array = all present.',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @ArrayUnique()
  absentStudentIds!: string[];
}
