import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { StudentRepository } from '@domain/student/ports/student.repository';
import type { PaymentRequestRepository } from '@domain/fee/ports/payment-request.repository';
import { PaymentRequestErrors } from '../../common/errors';
import type { PaymentRequestDto } from '../dtos/payment-request.dto';
import { toPaymentRequestDto } from '../dtos/payment-request.dto';
import { validateStaffNotes } from '@domain/fee/rules/payment-request.rules';
import type { UserRole } from '@playconnect/contracts';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';

export interface EditPaymentRequestInput {
  actorUserId: string;
  actorRole: UserRole;
  requestId: string;
  staffNotes: string;
}

export class EditPaymentRequestUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly studentRepo: StudentRepository,
    private readonly paymentRequestRepo: PaymentRequestRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(input: EditPaymentRequestInput): Promise<Result<PaymentRequestDto, AppError>> {
    if (input.actorRole !== 'STAFF') {
      return err(PaymentRequestErrors.cancelNotAllowed());
    }

    const notesCheck = validateStaffNotes(input.staffNotes);
    if (!notesCheck.valid) return err(PaymentRequestErrors.invalidNotes(notesCheck.reason!));

    const user = await this.userRepo.findById(input.actorUserId);
    if (!user || !user.academyId) return err(PaymentRequestErrors.academyRequired());

    const request = await this.paymentRequestRepo.findById(input.requestId);
    if (!request) return err(PaymentRequestErrors.requestNotFound(input.requestId));
    if (request.academyId !== user.academyId)
      return err(PaymentRequestErrors.requestNotInAcademy());
    if (request.staffUserId !== input.actorUserId) return err(PaymentRequestErrors.notOwnRequest());
    if (request.status !== 'PENDING') return err(PaymentRequestErrors.notPending());

    const updated = request.updateNotes(input.staffNotes);
    await this.paymentRequestRepo.save(updated);

    await this.auditRecorder.record({
      academyId: user.academyId,
      actorUserId: input.actorUserId,
      action: 'PAYMENT_REQUEST_UPDATED',
      entityType: 'PAYMENT_REQUEST',
      entityId: input.requestId,
      context: { paymentRequestId: input.requestId },
    });

    const student = await this.studentRepo.findById(updated.studentId);

    return ok(toPaymentRequestDto(updated, {
      staffName: user.fullName,
      studentName: student?.fullName,
    }));
  }
}
