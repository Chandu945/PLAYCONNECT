import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GENDERS } from '@academyflo/contracts';
import type { Gender } from '@academyflo/contracts';
import { trimAndCollapse, normalizeEmail } from '../../common/sanitizers/string-sanitizer';

export class UpdateStudentAddressDto {
  @ApiPropertyOptional({ example: '123 Main Street' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  line1?: string;

  @ApiPropertyOptional({ example: 'Apt 4B' })
  @IsOptional()
  @IsString()
  line2?: string | null;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  city?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  state?: string;

  @ApiPropertyOptional({ example: '400001' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'pincode must be exactly 6 digits' })
  pincode?: string;
}

export class UpdateStudentGuardianDto {
  @ApiPropertyOptional({ example: 'Raj Sharma' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  name?: string;

  @ApiPropertyOptional({ example: '+919876543210', description: 'E.164 format' })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'mobile must be in E.164 format (e.g. +919876543210)',
  })
  mobile?: string;

  @ApiPropertyOptional({ example: 'raj@example.com' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  email?: string;
}

export class UpdateStudentDto {
  @ApiPropertyOptional({ example: 'Arun Sharma' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  fullName?: string;

  @ApiPropertyOptional({ example: '2010-05-15', description: 'ISO date string (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD format' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'MALE', enum: [...GENDERS] })
  @IsOptional()
  @IsString()
  @IsIn([...GENDERS])
  gender?: Gender;

  @ApiPropertyOptional({ type: UpdateStudentAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateStudentAddressDto)
  address?: UpdateStudentAddressDto;

  @ApiPropertyOptional({ type: UpdateStudentGuardianDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateStudentGuardianDto)
  guardian?: UpdateStudentGuardianDto;

  @ApiPropertyOptional({ example: '2024-01-01', description: 'ISO date string (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'joiningDate must be YYYY-MM-DD format' })
  joiningDate?: string;

  @ApiPropertyOptional({ example: 500, description: 'Monthly fee in INR (integer > 0)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  monthlyFee?: number;

  @ApiPropertyOptional({ example: '+919876543211' })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'mobileNumber must be in E.164 format (e.g., +919876543210)',
  })
  mobileNumber?: string | null;

  @ApiPropertyOptional({ example: 'arun@example.com' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  email?: string | null;

  @ApiPropertyOptional({ example: 'Krishna' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  fatherName?: string | null;

  @ApiPropertyOptional({ example: 'Lakshmi' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  motherName?: string | null;

  @ApiPropertyOptional({ example: '+919491823468', description: 'E.164 format' })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'whatsappNumber must be in E.164 format (e.g. +919491823468)',
  })
  whatsappNumber?: string | null;

  @ApiPropertyOptional({ example: '456 Park Lane, Mumbai' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string | null;

}
