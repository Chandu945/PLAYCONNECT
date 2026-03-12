import type { StudentStatus, Gender, FeeFilter } from '@playconnect/contracts';

export type { StudentStatus, Gender, FeeFilter };

export type StudentAddress = {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
};

export type StudentGuardian = {
  name: string;
  mobile: string;
  email: string;
};

export type StudentInstituteInfo = {
  schoolName: string | null;
  rollNumber: string | null;
  standard: string | null;
};

export type StudentListItem = {
  id: string;
  academyId: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  address: StudentAddress;
  guardian: StudentGuardian;
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
  instituteInfo: StudentInstituteInfo | null;
  hasPassword: boolean;
  status: StudentStatus;
  createdAt: string;
  updatedAt: string;
};

export type StudentListFilters = {
  status?: StudentStatus;
  search?: string;
  feeFilter?: FeeFilter;
  month?: string;
  batchId?: string;
};

export type CreateStudentRequest = {
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  guardian: {
    name: string;
    mobile: string;
    email: string;
  };
  joiningDate: string;
  monthlyFee: number;
  mobileNumber?: string;
  email?: string;
  fatherName?: string;
  motherName?: string;
  aadhaarNumber?: string;
  caste?: string;
  whatsappNumber?: string;
  addressText?: string;
  instituteInfo?: {
    schoolName?: string;
    rollNumber?: string;
    standard?: string;
  };
  profilePhotoUrl?: string;
  password?: string;
};

export type UpdateStudentRequest = Partial<CreateStudentRequest>;

export type ChangeStudentStatusRequest = {
  status: StudentStatus;
  reason?: string;
};

export type StudentCredentials = {
  studentName: string;
  loginId: string;
  loginIdType: 'MOBILE' | 'EMAIL';
  hasPassword: boolean;
  academyName: string;
  shareText: string;
};

export type InviteParentResponse = {
  parentId: string;
  tempPassword: string;
  studentId: string;
  parentEmail: string;
  isExistingUser: boolean;
};
