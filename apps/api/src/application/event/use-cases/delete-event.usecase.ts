import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { EventRepository } from '@domain/event/ports/event.repository';
import { EventErrors } from '../../common/errors';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { UserRole } from '@playconnect/contracts';

export interface DeleteEventInput {
  actorUserId: string;
  actorRole: UserRole;
  eventId: string;
}

export class DeleteEventUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly eventRepo: EventRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(input: DeleteEventInput): Promise<Result<{ deleted: true }, AppError>> {
    if (input.actorRole !== 'OWNER') {
      return err(EventErrors.deleteNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) return err(EventErrors.academyRequired());

    const event = await this.eventRepo.findById(input.eventId);
    if (!event) return err(EventErrors.notFound(input.eventId));
    if (event.academyId !== actor.academyId) return err(EventErrors.notInAcademy());

    await this.eventRepo.delete(input.eventId);

    await this.auditRecorder.record({
      academyId: actor.academyId,
      actorUserId: input.actorUserId,
      action: 'EVENT_DELETED',
      entityType: 'EVENT',
      entityId: input.eventId,
    });

    return ok({ deleted: true as const });
  }
}
