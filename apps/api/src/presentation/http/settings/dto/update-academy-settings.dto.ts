import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateAcademySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  defaultDueDateDay?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  receiptPrefix?: string;

  @IsOptional()
  @IsBoolean()
  lateFeeEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  gracePeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  lateFeeAmountInr?: number;

  @IsOptional()
  @IsInt()
  @IsIn([1, 3, 5])
  lateFeeRepeatIntervalDays?: number;
}
