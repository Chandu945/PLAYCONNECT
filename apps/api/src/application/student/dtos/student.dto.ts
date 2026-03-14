import type { Gender, StudentStatus } from '@playconnect/contracts';
import type { Student } from '@domain/student/entities/student.entity';
import type { StudentListRow } from '@domain/student/ports/student-query.repository';

export interface StudentAddressDto {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface StudentGuardianDto {
  name: string;
  mobile: string;
  email: string;
}

export interface StudentInstituteInfoDto {
  schoolName: string | null;
  rollNumber: string | null;
  standard: string | null;
}

export interface StudentDto {
  id: string;
  academyId: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  address: StudentAddressDto;
  guardian: StudentGuardianDto;
  joiningDate: string;
  monthlyFee: number;
  mobileNumber: string | null;
  email: string | null;
  profilePhotoUrl: string | null;
  fatherName: string | null;
  motherName: string | null;
  aadhaarNumber: string | null;
  caste: string | null;
  whatsappNumber: string | null;
  addressText: string | null;
  instituteInfo: StudentInstituteInfoDto | null;
  hasPassword: boolean;
  status: StudentStatus;
  createdAt: Date;
  updatedAt: Date;
}

function maskAadhaar(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return 'XXXX XXXX XXXX';
  return `XXXX XXXX ${digits.slice(-4)}`;
}

export function toStudentDto(student: Student): StudentDto {
  return {
    id: student.id.toString(),
    academyId: student.academyId,
    fullName: student.fullName,
    dateOfBirth: student.dateOfBirth.toISOString().slice(0, 10),
    gender: student.gender,
    address: {
      line1: student.address.line1,
      line2: student.address.line2 ?? null,
      city: student.address.city,
      state: student.address.state,
      pincode: student.address.pincode,
    },
    guardian: {
      name: student.guardian.name,
      mobile: student.guardian.mobile,
      email: student.guardian.email,
    },
    joiningDate: student.joiningDate.toISOString().slice(0, 10),
    monthlyFee: student.monthlyFee,
    mobileNumber: student.mobileNumber,
    email: student.email,
    profilePhotoUrl: student.profilePhotoUrl,
    fatherName: student.fatherName,
    motherName: student.motherName,
    aadhaarNumber: maskAadhaar(student.aadhaarNumber),
    caste: student.caste,
    whatsappNumber: student.whatsappNumber,
    addressText: student.addressText,
    instituteInfo: student.instituteInfo,
    hasPassword: student.passwordHash !== null,
    status: student.status,
    createdAt: student.audit.createdAt,
    updatedAt: student.audit.updatedAt,
  };
}

export function toStudentDtoFromRow(row: StudentListRow): StudentDto {
  return {
    id: row.id,
    academyId: row.academyId,
    fullName: row.fullName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    address: {
      line1: row.address.line1,
      line2: row.address.line2,
      city: row.address.city,
      state: row.address.state,
      pincode: row.address.pincode,
    },
    guardian: {
      name: row.guardian.name,
      mobile: row.guardian.mobile,
      email: row.guardian.email,
    },
    joiningDate: row.joiningDate,
    monthlyFee: row.monthlyFee,
    mobileNumber: row.mobileNumber,
    email: row.email,
    profilePhotoUrl: row.profilePhotoUrl,
    fatherName: row.fatherName,
    motherName: row.motherName,
    aadhaarNumber: maskAadhaar(row.aadhaarNumber),
    caste: row.caste,
    whatsappNumber: row.whatsappNumber,
    addressText: row.addressText,
    instituteInfo: row.instituteInfo,
    hasPassword: row.hasPassword,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
