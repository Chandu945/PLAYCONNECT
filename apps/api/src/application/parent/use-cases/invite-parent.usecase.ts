import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { User } from '@domain/identity/entities/user.entity';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { ParentStudentLinkRepository } from '@domain/parent/ports/parent-student-link.repository';
import type { PasswordHasher } from '../../identity/ports/password-hasher.port';
import { canInviteParent } from '@domain/parent/rules/parent.rules';
import { ParentStudentLink } from '@domain/parent/entities/parent-student-link.entity';
import { AuthErrors, ParentErrors, StudentErrors } from '../../common/errors';
import type { UserRole } from '@playconnect/contracts';
import { randomUUID } from 'crypto';

export interface InviteParentInput {
  ownerUserId: string;
  ownerRole: UserRole;
  studentId: string;
}

export interface InviteParentOutput {
  parentId: string;
  tempPassword: string;
  studentId: string;
  parentEmail: string;
  isExistingUser: boolean;
}

export class InviteParentUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly linkRepo: ParentStudentLinkRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: InviteParentInput): Promise<Result<InviteParentOutput, AppError>> {
    const check = canInviteParent(input.ownerRole);
    if (!check.allowed) return err(ParentErrors.inviteNotAllowed());

    const owner = await this.userRepo.findById(input.ownerUserId);
    if (!owner || !owner.academyId) return err(StudentErrors.academyRequired());

    const student = await this.studentRepo.findById(input.studentId);
    if (!student) return err(StudentErrors.notFound(input.studentId));
    if (student.academyId !== owner.academyId) return err(StudentErrors.notInAcademy());

    const guardian = student.guardian;
    if (!guardian.email) return err(ParentErrors.guardianEmailRequired());
    if (!guardian.mobile) return err(ParentErrors.guardianPhoneRequired());

    const guardianEmail = guardian.email.trim().toLowerCase();
    const guardianPhone = guardian.mobile.trim();

    // Check if user with this email already exists
    const existingUser = await this.userRepo.findByEmail(guardianEmail);

    let parentUserId: string;
    let tempPassword = '';
    let isExistingUser = false;

    if (existingUser) {
      if (existingUser.role !== 'PARENT') {
        return err(AuthErrors.duplicateEmail());
      }
      parentUserId = existingUser.id.toString();
      isExistingUser = true;
    } else {
      // Check phone uniqueness
      const existingByPhone = await this.userRepo.findByPhone(guardianPhone);
      if (existingByPhone) return err(AuthErrors.duplicatePhone());

      tempPassword = randomUUID().substring(0, 8);
      const passwordHash = await this.passwordHasher.hash(tempPassword);
      parentUserId = randomUUID();

      const parent = User.create({
        id: parentUserId,
        fullName: guardian.name,
        email: guardianEmail,
        phoneNumber: guardianPhone,
        role: 'PARENT',
        passwordHash,
      });

      // Set academyId
      const parentWithAcademy = User.reconstitute(parentUserId, {
        fullName: parent.fullName,
        email: parent.email,
        phone: parent.phone,
        role: parent.role,
        status: parent.status,
        passwordHash: parent.passwordHash,
        academyId: owner.academyId,
        tokenVersion: parent.tokenVersion,
        audit: parent.audit,
        softDelete: parent.softDelete,
      });

      await this.userRepo.save(parentWithAcademy);
    }

    // Check if link already exists
    const existingLink = await this.linkRepo.findByParentAndStudent(parentUserId, input.studentId);
    if (existingLink) return err(ParentErrors.linkAlreadyExists());

    // Create link
    const link = ParentStudentLink.create({
      id: randomUUID(),
      parentUserId,
      studentId: input.studentId,
      academyId: owner.academyId,
    });
    await this.linkRepo.save(link);

    return ok({
      parentId: parentUserId,
      tempPassword,
      studentId: input.studentId,
      parentEmail: guardianEmail,
      isExistingUser,
    });
  }
}
