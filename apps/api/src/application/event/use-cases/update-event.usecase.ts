import type { Result } from '@shared/kernel';
import { ok, err, updateAuditFields } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { EventRepository } from '@domain/event/ports/event.repository';
import { CalendarEvent, deriveEventStatus } from '@domain/event/entities/event.entity';
import type { EventType, TargetAudience } from '@domain/event/entities/event.entity';
import { EventErrors } from '../../common/errors';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { UserRole } from '@playconnect/contracts';

export interface UpdateEventInput {
  actorUserId: string;
  actorRole: UserRole;
  eventId: string;
  title?: string;
  description?: string | null;
  eventType?: EventType | null;
  startDate?: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  location?: string | null;
  targetAudience?: TargetAudience | null;
  batchIds?: string[];
}

export class UpdateEventUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly eventRepo: EventRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(input: UpdateEventInput): Promise<Result<Record<string, unknown>, AppError>> {
    if (input.actorRole !== 'OWNER' && input.actorRole !== 'STAFF') {
      return err(EventErrors.manageNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) return err(EventErrors.academyRequired());

    const event = await this.eventRepo.findById(input.eventId);
    if (!event) return err(EventErrors.notFound(input.eventId));
    if (event.academyId !== actor.academyId) return err(EventErrors.notInAcademy());

    // Staff can only edit events they created
    if (input.actorRole === 'STAFF' && event.createdBy !== input.actorUserId) {
      return err(EventErrors.editNotAllowed());
    }

    const title = input.title?.trim() ?? event.title;
    if (title.length < 2) {
      return err(AppErrorClass.validation('Title must be at least 2 characters'));
    }

    const startDate = input.startDate ? new Date(input.startDate) : event.startDate;
    let endDate = input.endDate !== undefined
      ? (input.endDate ? new Date(input.endDate) : null)
      : event.endDate;

    if (endDate && endDate < startDate) {
      return err(EventErrors.invalidDateRange());
    }

    const isAllDay = input.isAllDay ?? event.isAllDay;
    const startTime = isAllDay ? null : (input.startTime !== undefined ? input.startTime : event.startTime);
    const endTime = isAllDay ? null : (input.endTime !== undefined ? input.endTime : event.endTime);

    if (!isAllDay && !startTime) {
      return err(EventErrors.missingStartTime());
    }

    if (startTime && endTime && !isAllDay) {
      const sameDay = !endDate || endDate.getTime() === startDate.getTime();
      if (sameDay && endTime <= startTime) {
        return err(EventErrors.invalidTimeRange());
      }
    }

    // Recalculate status if dates changed and status wasn't manually overridden
    let status = event.status;
    if (status !== 'CANCELLED') {
      status = deriveEventStatus(startDate, endDate);
    }

    const updated = CalendarEvent.reconstitute(input.eventId, {
      academyId: event.academyId,
      title,
      description: input.description !== undefined ? (input.description?.trim().slice(0, 2000) ?? null) : event.description,
      eventType: input.eventType !== undefined ? input.eventType : event.eventType,
      startDate,
      endDate,
      startTime,
      endTime,
      isAllDay,
      location: input.location !== undefined ? (input.location?.trim().slice(0, 500) ?? null) : event.location,
      targetAudience: input.targetAudience !== undefined ? input.targetAudience : event.targetAudience,
      batchIds: input.batchIds ?? event.batchIds,
      status,
      createdBy: event.createdBy,
      audit: updateAuditFields(event.audit),
    });

    await this.eventRepo.save(updated);

    await this.auditRecorder.record({
      academyId: actor.academyId,
      actorUserId: input.actorUserId,
      action: 'EVENT_UPDATED',
      entityType: 'EVENT',
      entityId: updated.id.toString(),
    });

    return ok({
      id: updated.id.toString(),
      title: updated.title,
      description: updated.description,
      eventType: updated.eventType,
      startDate: updated.startDate.toISOString().slice(0, 10),
      endDate: updated.endDate?.toISOString().slice(0, 10) ?? null,
      startTime: updated.startTime,
      endTime: updated.endTime,
      isAllDay: updated.isAllDay,
      location: updated.location,
      targetAudience: updated.targetAudience,
      batchIds: updated.batchIds,
      status: updated.status,
      createdBy: updated.createdBy,
      createdAt: updated.audit.createdAt.toISOString(),
      updatedAt: updated.audit.updatedAt.toISOString(),
    });
  }
}
