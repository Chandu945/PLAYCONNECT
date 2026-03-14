import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  Min,
  IsDateString,
  Matches,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { trimAndCollapse, normalizeEmail } from '../../common/sanitizers/string-sanitizer';

export class StaffQualificationInfoDto {
  @ApiPropertyOptional({ example: 'B.Ed' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  qualification?: string | null;

  @ApiPropertyOptional({ example: 'Head Coach' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string | null;
}

export class StaffSalaryConfigDto {
  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;

  @ApiPropertyOptional({ example: 'MONTHLY', enum: ['MONTHLY', 'WEEKLY', 'DAILY'] })
  @IsOptional()
  @IsIn(['MONTHLY', 'WEEKLY', 'DAILY'])
  frequency?: string;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  fullName!: string;

  @ApiProperty({ example: '+919876543211', description: 'E.164 format' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phoneNumber must be in E.164 format (e.g. +919876543210)',
  })
  phoneNumber!: string;

  @ApiProperty({ example: 'priya@example.com' })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  email!: string;

  @ApiProperty({ description: 'Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/, {
    message:
      'Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character',
  })
  password!: string;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: 'MALE', enum: ['MALE', 'FEMALE'] })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsappNumber?: string | null;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobileNumber?: string | null;

  @ApiPropertyOptional({ example: '123, MG Road, Bangalore' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ type: StaffQualificationInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StaffQualificationInfoDto)
  qualificationInfo?: StaffQualificationInfoDto | null;

  @ApiPropertyOptional({ type: StaffSalaryConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StaffSalaryConfigDto)
  salaryConfig?: StaffSalaryConfigDto | null;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  profilePhotoUrl?: string | null;
}
