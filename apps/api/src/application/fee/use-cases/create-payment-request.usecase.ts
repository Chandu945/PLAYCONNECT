import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { FeeDueRepository } from '@domain/fee/ports/fee-due.repository';
import type { PaymentRequestRepository } from '@domain/fee/ports/payment-request.repository';
import { PaymentRequest } from '@domain/fee/entities/payment-request.entity';
import {
  canCreatePaymentRequest,
  validateStaffNotes,
} from '@domain/fee/rules/payment-request.rules';
import { PaymentRequestErrors } from '../../common/errors';
import type { PaymentRequestDto } from '../dtos/payment-request.dto';
import { toPaymentRequestDto } from '../dtos/payment-request.dto';
import type { UserRole } from '@playconnect/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import { randomUUID } from 'crypto';

export interface CreatePaymentRequestInput {
  actorUserId: string;
  actorRole: UserRole;
  studentId: string;
  monthKey: string;
  staffNotes: string;
}

export class CreatePaymentRequestUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly feeDueRepo: FeeDueRepository,
    private readonly paymentRequestRepo: PaymentRequestRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(input: CreatePaymentRequestInput): Promise<Result<PaymentRequestDto, AppError>> {
    const check = canCreatePaymentRequest(input.actorRole);
    if (!check.allowed) return err(PaymentRequestErrors.createNotAllowed());

    const notesCheck = validateStaffNotes(input.staffNotes);
    if (!notesCheck.valid) return err(PaymentRequestErrors.invalidNotes(notesCheck.reason!));

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(PaymentRequestErrors.academyRequired());

    const student = await this.studentRepo.findById(input.studentId);
    if (!student) return err(PaymentRequestErrors.studentNotFound(input.studentId));
    if (student.academyId !== user.academyId)
      return err(PaymentRequestErrors.studentNotInAcademy());

    const due = await this.feeDueRepo.findByAcademyStudentMonth(
      user.academyId,
      input.studentId,
      input.monthKey,
    );
    if (!due) return err(PaymentRequestErrors.dueNotFound(`${input.studentId}:${input.monthKey}`));
    if (due.status === 'PAID') return err(PaymentRequestErrors.alreadyPaid());

    const existingPending = await this.paymentRequestRepo.findPendingByFeeDue(due.id.toString());
    if (existingPending) return err(PaymentRequestErrors.duplicatePending());

    const pr = PaymentRequest.create({
      id: randomUUID(),
      academyId: user.academyId,
      studentId: input.studentId,
      feeDueId: due.id.toString(),
      monthKey: input.monthKey,
      amount: due.amount,
      staffUserId: input.actorUserId,
      staffNotes: input.staffNotes.trim(),
    });

    await this.paymentRequestRepo.save(pr);

    await this.auditRecorder.record({
      academyId: user.academyId,
      actorUserId: input.actorUserId,
      action: 'PAYMENT_REQUEST_CREATED',
      entityType: 'PAYMENT_REQUEST',
      entityId: pr.id.toString(),
      context: { studentId: input.studentId, monthKey: input.monthKey, amount: String(due.amount) },
    });

    return ok(toPaymentRequestDto(pr, {
      staffName: user.fullName,
      studentName: student.fullName,
    }));
  }
}
