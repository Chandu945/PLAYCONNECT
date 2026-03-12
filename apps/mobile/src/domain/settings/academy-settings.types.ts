export type AcademySettings = {
  defaultDueDateDay: number;
  receiptPrefix: string;
  lateFeeEnabled: boolean;
  gracePeriodDays: number;
  lateFeeAmountInr: number;
  lateFeeRepeatIntervalDays: number;
};

export type UpdateAcademySettingsRequest = {
  defaultDueDateDay?: number;
  receiptPrefix?: string;
  lateFeeEnabled?: boolean;
  gracePeriodDays?: number;
  lateFeeAmountInr?: number;
  lateFeeRepeatIntervalDays?: number;
};
