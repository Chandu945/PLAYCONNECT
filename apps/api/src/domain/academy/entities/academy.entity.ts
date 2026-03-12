import type { AuditFields, SoftDeleteFields } from '@shared/kernel';
import {
  Entity,
  UniqueId,
  createAuditFields,
  updateAuditFields,
  initSoftDelete,
} from '@shared/kernel';

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface BankDetails {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName: string;
}

export interface InstituteInfo {
  signatureStampUrl: string | null;
  bankDetails: BankDetails | null;
  upiId: string | null;
  qrCodeImageUrl: string | null;
}

export interface AcademyProps {
  ownerUserId: string;
  academyName: string;
  address: Address;
  loginDisabled: boolean;
  /** Timestamp when academy login was disabled by admin. Cleared when re-enabled. */
  deactivatedAt: Date | null;
  defaultDueDateDay: number | null;
  receiptPrefix: string | null;
  lateFeeEnabled: boolean;
  gracePeriodDays: number;
  lateFeeAmountInr: number;
  lateFeeRepeatIntervalDays: number;
  instituteInfo?: InstituteInfo;
  audit: AuditFields;
  softDelete: SoftDeleteFields;
}

export class Academy extends Entity<AcademyProps> {
  private constructor(id: UniqueId, props: AcademyProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    ownerUserId: string;
    academyName: string;
    address: Address;
  }): Academy {
    return new Academy(new UniqueId(params.id), {
      ownerUserId: params.ownerUserId,
      academyName: params.academyName.trim(),
      address: params.address,
      loginDisabled: false,
      deactivatedAt: null,
      defaultDueDateDay: null,
      receiptPrefix: null,
      lateFeeEnabled: false,
      gracePeriodDays: 5,
      lateFeeAmountInr: 0,
      lateFeeRepeatIntervalDays: 5,
      audit: createAuditFields(),
      softDelete: initSoftDelete(),
    });
  }

  static reconstitute(id: string, props: AcademyProps): Academy {
    return new Academy(new UniqueId(id), props);
  }

  get ownerUserId(): string {
    return this.props.ownerUserId;
  }

  get academyName(): string {
    return this.props.academyName;
  }

  get address(): Address {
    return this.props.address;
  }

  get loginDisabled(): boolean {
    return this.props.loginDisabled;
  }

  get deactivatedAt(): Date | null {
    return this.props.deactivatedAt;
  }

  get defaultDueDateDay(): number | null {
    return this.props.defaultDueDateDay;
  }

  get receiptPrefix(): string | null {
    return this.props.receiptPrefix;
  }

  get lateFeeEnabled(): boolean {
    return this.props.lateFeeEnabled;
  }

  get gracePeriodDays(): number {
    return this.props.gracePeriodDays;
  }

  get lateFeeAmountInr(): number {
    return this.props.lateFeeAmountInr;
  }

  get lateFeeRepeatIntervalDays(): number {
    return this.props.lateFeeRepeatIntervalDays;
  }

  get audit(): AuditFields {
    return this.props.audit;
  }

  get instituteInfo(): InstituteInfo {
    return this.props.instituteInfo ?? {
      signatureStampUrl: null,
      bankDetails: null,
      upiId: null,
      qrCodeImageUrl: null,
    };
  }

  get softDelete(): SoftDeleteFields {
    return this.props.softDelete;
  }

  updateInstituteInfo(params: {
    bankDetails?: BankDetails | null;
    upiId?: string | null;
    signatureStampUrl?: string | null;
    qrCodeImageUrl?: string | null;
  }): Academy {
    const current = this.instituteInfo;
    return Academy.reconstitute(this.id.toString(), {
      ...this.props,
      instituteInfo: {
        signatureStampUrl: params.signatureStampUrl !== undefined ? params.signatureStampUrl : current.signatureStampUrl,
        bankDetails: params.bankDetails !== undefined ? params.bankDetails : current.bankDetails,
        upiId: params.upiId !== undefined ? params.upiId : current.upiId,
        qrCodeImageUrl: params.qrCodeImageUrl !== undefined ? params.qrCodeImageUrl : current.qrCodeImageUrl,
      },
      audit: updateAuditFields(this.props.audit),
    });
  }

  updateSettings(params: {
    defaultDueDateDay?: number;
    receiptPrefix?: string;
    lateFeeEnabled?: boolean;
    gracePeriodDays?: number;
    lateFeeAmountInr?: number;
    lateFeeRepeatIntervalDays?: number;
  }): Academy {
    return Academy.reconstitute(this.id.toString(), {
      ...this.props,
      defaultDueDateDay: params.defaultDueDateDay ?? this.props.defaultDueDateDay,
      receiptPrefix: params.receiptPrefix ?? this.props.receiptPrefix,
      lateFeeEnabled: params.lateFeeEnabled ?? this.props.lateFeeEnabled,
      gracePeriodDays: params.gracePeriodDays ?? this.props.gracePeriodDays,
      lateFeeAmountInr: params.lateFeeAmountInr ?? this.props.lateFeeAmountInr,
      lateFeeRepeatIntervalDays: params.lateFeeRepeatIntervalDays ?? this.props.lateFeeRepeatIntervalDays,
      audit: updateAuditFields(this.props.audit),
    });
  }

  setLoginDisabled(disabled: boolean): Academy {
    return Academy.reconstitute(this.id.toString(), {
      ...this.props,
      loginDisabled: disabled,
      deactivatedAt: disabled ? new Date() : null,
      audit: updateAuditFields(this.props.audit),
    });
  }
}
