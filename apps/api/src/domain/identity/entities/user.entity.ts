import type { AuditFields, SoftDeleteFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields, updateAuditFields, initSoftDelete } from '@shared/kernel';
import type { UserRole } from '@playconnect/contracts';
import { Email } from '../value-objects/email.vo';
import { Phone } from '../value-objects/phone.vo';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export type SalaryFrequency = 'MONTHLY' | 'WEEKLY' | 'DAILY';

export interface StaffQualificationInfo {
  qualification: string | null;
  position: string | null;
}

export interface StaffSalaryConfig {
  amount: number | null;
  frequency: SalaryFrequency;
}

export interface UserProps {
  fullName: string;
  email: Email;
  phone: Phone;
  role: UserRole;
  status: UserStatus;
  passwordHash: string;
  academyId: string | null;
  tokenVersion: number;
  audit: AuditFields;
  softDelete: SoftDeleteFields;
  // Staff-specific extended fields (optional, only populated for STAFF users)
  profilePhotoUrl?: string | null;
  startDate?: Date | null;
  gender?: 'MALE' | 'FEMALE' | null;
  whatsappNumber?: string | null;
  mobileNumber?: string | null;
  address?: string | null;
  qualificationInfo?: StaffQualificationInfo | null;
  salaryConfig?: StaffSalaryConfig | null;
}

export class User extends Entity<UserProps> {
  private constructor(id: UniqueId, props: UserProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    role: UserRole;
    passwordHash: string;
  }): User {
    return new User(new UniqueId(params.id), {
      fullName: params.fullName.trim(),
      email: Email.create(params.email),
      phone: Phone.create(params.phoneNumber),
      role: params.role,
      status: 'ACTIVE',
      passwordHash: params.passwordHash,
      academyId: null,
      tokenVersion: 0,
      audit: createAuditFields(),
      softDelete: initSoftDelete(),
    });
  }

  static reconstitute(id: string, props: UserProps): User {
    return new User(new UniqueId(id), props);
  }

  get fullName(): string {
    return this.props.fullName;
  }

  get email(): Email {
    return this.props.email;
  }

  get emailNormalized(): string {
    return this.props.email.toString();
  }

  get phone(): Phone {
    return this.props.phone;
  }

  get phoneE164(): string {
    return this.props.phone.toString();
  }

  get role(): UserRole {
    return this.props.role;
  }

  get status(): UserStatus {
    return this.props.status;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get academyId(): string | null {
    return this.props.academyId;
  }

  get tokenVersion(): number {
    return this.props.tokenVersion;
  }

  get audit(): AuditFields {
    return this.props.audit;
  }

  get softDelete(): SoftDeleteFields {
    return this.props.softDelete;
  }

  get profilePhotoUrl(): string | null {
    return this.props.profilePhotoUrl ?? null;
  }

  get startDate(): Date | null {
    return this.props.startDate ?? null;
  }

  get gender(): 'MALE' | 'FEMALE' | null {
    return this.props.gender ?? null;
  }

  get whatsappNumber(): string | null {
    return this.props.whatsappNumber ?? null;
  }

  get mobileNumber(): string | null {
    return this.props.mobileNumber ?? null;
  }

  get address(): string | null {
    return this.props.address ?? null;
  }

  get qualificationInfo(): StaffQualificationInfo | null {
    return this.props.qualificationInfo ?? null;
  }

  get salaryConfig(): StaffSalaryConfig | null {
    return this.props.salaryConfig ?? null;
  }

  isActive(): boolean {
    return this.props.status === 'ACTIVE';
  }

  updateProfile(fullName?: string, phoneNumber?: string): User {
    return User.reconstitute(this.id.toString(), {
      ...this.props,
      fullName: fullName?.trim() ?? this.props.fullName,
      phone: phoneNumber ? Phone.create(phoneNumber) : this.props.phone,
      audit: updateAuditFields(this.props.audit),
    });
  }

  changePassword(newHash: string): User {
    return User.reconstitute(this.id.toString(), {
      ...this.props,
      passwordHash: newHash,
      tokenVersion: this.props.tokenVersion + 1,
      audit: updateAuditFields(this.props.audit),
    });
  }
}
