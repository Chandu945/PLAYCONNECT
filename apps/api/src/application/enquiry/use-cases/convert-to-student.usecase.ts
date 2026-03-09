import { randomUUID } from 'crypto';
import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { EnquiryRepository } from '@domain/enquiry/ports/enquiry.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import { Student } from '@domain/student/entities/student.entity';
import type { TransactionPort } from '../../common/transaction.port';
import { EnquiryErrors } from '../../common/errors';
import { toEnquiryDetail } from './get-enquiry-detail.usecase';
import type { EnquiryDetailOutput } from './get-enquiry-detail.usecase';
import type { UserRole } from '@playconnect/contracts';

export interface ConvertToStudentInput {
  actorUserId: string;
  actorRole: UserRole;
  enquiryId: string;
  joiningDate: string;
  monthlyFee: number;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
}

export interface ConvertToStudentOutput {
  enquiry: EnquiryDetailOutput;
  studentId: string;
}

export class ConvertToStudentUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly enquiryRepo: EnquiryRepository,
    private readonly studentRepo: StudentRepository,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(input: ConvertToStudentInput): Promise<Result<ConvertToStudentOutput, AppError>> {
    if (input.actorRole !== 'OWNER') {
      return err(EnquiryErrors.convertNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(EnquiryErrors.academyRequired());
    }

    const enquiry = await this.enquiryRepo.findById(input.enquiryId);
    if (!enquiry || enquiry.academyId !== actor.academyId) {
      return err(EnquiryErrors.notFound(input.enquiryId));
    }

    if (!enquiry.isActive) {
      return err(EnquiryErrors.alreadyClosed());
    }

    const studentId = randomUUID();
    const student = Student.create({
      id: studentId,
      academyId: actor.academyId,
      fullName: enquiry.prospectName,
      dateOfBirth: new Date(input.dateOfBirth),
      gender: input.gender,
      address: {
        line1: input.addressLine1,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
      },
      guardian: {
        name: enquiry.guardianName ?? enquiry.prospectName,
        mobile: enquiry.mobileNumber,
        email: enquiry.email ?? '',
      },
      joiningDate: new Date(input.joiningDate),
      monthlyFee: input.monthlyFee,
      mobileNumber: enquiry.mobileNumber,
      email: enquiry.email,
      whatsappNumber: enquiry.whatsappNumber,
      addressText: enquiry.address,
    });

    const closed = enquiry.close('CONVERTED', studentId);

    await this.transaction.run(async () => {
      await this.studentRepo.save(student);
      await this.enquiryRepo.save(closed);
    });

    return ok({
      enquiry: toEnquiryDetail(closed),
      studentId,
    });
  }
}
