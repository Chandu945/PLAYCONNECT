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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GENDERS } from '@academyflo/contracts';
import type { Gender } from '@academyflo/contracts';
import { trimAndCollapse, normalizeEmail } from '../../common/sanitizers/string-sanitizer';

export class StudentAddressDto {
  @ApiProperty({ example: '123 Main Street' })
  @IsString()
  @IsNotEmpty()
  line1!: string;

  @ApiPropertyOptional({ example: 'Apt 4B' })
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({ example: '400001' })
  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'pincode must be exactly 6 digits' })
  pincode!: string;
}

export class StudentGuardianDto {
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

export class CreateStudentDto {
  @ApiProperty({ example: 'Arun Sharma' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  fullName!: string;

  @ApiProperty({ example: '2010-05-15', description: 'ISO date string (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD format' })
  dateOfBirth!: string;

  @ApiProperty({ example: 'MALE', enum: [...GENDERS] })
  @IsString()
  @IsIn([...GENDERS])
  gender!: Gender;

  @ApiProperty({ type: StudentAddressDto })
  @ValidateNested()
  @Type(() => StudentAddressDto)
  address!: StudentAddressDto;

  @ApiPropertyOptional({ type: StudentGuardianDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentGuardianDto)
  guardian?: StudentGuardianDto;

  @ApiProperty({ example: '2024-01-01', description: 'ISO date string (YYYY-MM-DD)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'joiningDate must be YYYY-MM-DD format' })
  joiningDate!: string;

  @ApiProperty({ example: 500, description: 'Monthly fee in INR (integer > 0)' })
  @IsInt()
  @Min(1)
  monthlyFee!: number;

  // Required on Create as of the product rule "every new student must have a
  // contact number". UpdateStudentDto keeps it @IsOptional() so a partial
  // update of unrelated fields doesn't require re-sending mobileNumber —
  // the UI enforces required on edit so legacy null records get filled.
  @ApiProperty({ example: '+919876543211' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'mobileNumber must be in E.164 format (e.g. +919876543211)',
  })
  mobileNumber!: string;

  @ApiPropertyOptional({ example: 'arun@example.com' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  email?: string;

  @ApiPropertyOptional({ example: 'Krishna' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  fatherName?: string;

  @ApiPropertyOptional({ example: 'Lakshmi' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Transform(({ value }) => (typeof value === 'string' ? trimAndCollapse(value) : value))
  motherName?: string;

  @ApiPropertyOptional({ example: '+919491823468', description: 'E.164 format' })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'whatsappNumber must be in E.164 format (e.g. +919491823468)',
  })
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: '456 Park Lane, Mumbai' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/...', description: 'Pre-uploaded photo URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\//, { message: 'profilePhotoUrl must be a valid HTTP or HTTPS URL' })
  profilePhotoUrl?: string;
}
