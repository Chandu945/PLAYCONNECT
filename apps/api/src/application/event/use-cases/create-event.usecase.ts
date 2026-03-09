import { randomUUID } from 'crypto';
import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { AppError as AppErrorClass } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { EventRepository } from '@domain/event/ports/event.repository';
import { CalendarEvent, deriveEventStatus } from '@domain/event/entities/event.entity';
import type { EventType, TargetAudience } from '@domain/event/entities/event.entity';
import { EventErrors } from '../../common/errors';
import type { AuditRecorderPort } from '../../audit/ports/audit-recorder.port';
import type { UserRole } from '@playconnect/contracts';

export interface CreateEventInput {
  actorUserId: string;
  actorRole: UserRole;
  title: string;
  description?: string | null;
  eventType?: EventType | null;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isAllDay: boolean;
  location?: string | null;
  targetAudience?: TargetAudience | null;
  batchIds?: string[];
}

export interface CreateEventOutput {
  id: string;
  title: string;
  description: string | null;
  eventType: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  location: string | null;
  targetAudience: string | null;
  batchIds: string[];
  status: string;
  createdBy: string;
  createdAt: string;
}

export class CreateEventUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly eventRepo: EventRepository,
    private readonly auditRecorder: AuditRecorderPort,
  ) {}

  async execute(input: CreateEventInput): Promise<Result<CreateEventOutput, AppError>> {
    if (input.actorRole !== 'OWNER' && input.actorRole !== 'STAFF') {
      return err(EventErrors.manageNotAllowed());
    }

    const actor = await this.userRepo.findById(input.actorUserId);
    if (!actor || !actor.academyId) {
      return err(EventErrors.academyRequired());
    }

    if (!input.title || input.title.trim().length < 2) {
      return err(AppErrorClass.validation('Title must be at least 2 characters'));
    }

    const startDate = new Date(input.startDate);
    if (isNaN(startDate.getTime())) {
      return err(AppErrorClass.validation('Invalid start date'));
    }

    let endDate: Date | null = null;
    if (input.endDate) {
      endDate = new Date(input.endDate);
      if (isNaN(endDate.getTime())) {
        return err(AppErrorClass.validation('Invalid end date'));
      }
      if (endDate < startDate) {
        return err(EventErrors.invalidDateRange());
      }
    }

    if (!input.isAllDay && !input.startTime) {
      return err(EventErrors.missingStartTime());
    }

    if (input.startTime && input.endTime && !input.isAllDay) {
      const sameDay = !endDate || endDate.getTime() === startDate.getTime();
      if (sameDay && input.endTime <= input.startTime) {
        return err(EventErrors.invalidTimeRange());
      }
    }

    const status = deriveEventStatus(startDate, endDate);

    const event = CalendarEvent.create({
      id: randomUUID(),
      academyId: actor.academyId,
      title: input.title.trim(),
      description: input.description?.trim().slice(0, 2000) ?? null,
      eventType: input.eventType,
      startDate,
      endDate,
      startTime: input.isAllDay ? null : (input.startTime ?? null),
      endTime: input.isAllDay ? null : (input.endTime ?? null),
      isAllDay: input.isAllDay,
      location: input.location?.trim().slice(0, 500) ?? null,
      targetAudience: input.targetAudience,
      batchIds: input.batchIds ?? [],
      status,
      createdBy: input.actorUserId,
    });

    await this.eventRepo.save(event);

    await this.auditRecorder.record({
      academyId: actor.academyId,
      actorUserId: input.actorUserId,
      action: 'EVENT_CREATED',
      entityType: 'EVENT',
      entityId: event.id.toString(),
    });

    return ok({
      id: event.id.toString(),
      title: event.title,
      description: event.description,
      eventType: event.eventType,
      startDate: event.startDate.toISOString().slice(0, 10),
      endDate: event.endDate?.toISOString().slice(0, 10) ?? null,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      location: event.location,
      targetAudience: event.targetAudience,
      batchIds: event.batchIds,
      status: event.status,
      createdBy: event.createdBy,
      createdAt: event.audit.createdAt.toISOString(),
    });
  }
}
