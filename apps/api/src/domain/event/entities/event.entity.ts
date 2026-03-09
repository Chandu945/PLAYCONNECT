import type { AuditFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields, updateAuditFields } from '@shared/kernel';

export type EventStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
export type EventType = 'TOURNAMENT' | 'MEETING' | 'DEMO_CLASS' | 'HOLIDAY' | 'ANNUAL_DAY' | 'TRAINING_CAMP' | 'OTHER';
export type TargetAudience = 'ALL' | 'STUDENTS' | 'STAFF' | 'PARENTS';

export interface EventProps {
  academyId: string;
  title: string;
  description: string | null;
  eventType: EventType | null;
  startDate: Date;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  location: string | null;
  targetAudience: TargetAudience | null;
  batchIds: string[];
  status: EventStatus;
  createdBy: string;
  audit: AuditFields;
}

export class CalendarEvent extends Entity<EventProps> {
  private constructor(id: UniqueId, props: EventProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    academyId: string;
    title: string;
    description?: string | null;
    eventType?: EventType | null;
    startDate: Date;
    endDate?: Date | null;
    startTime?: string | null;
    endTime?: string | null;
    isAllDay: boolean;
    location?: string | null;
    targetAudience?: TargetAudience | null;
    batchIds?: string[];
    status: EventStatus;
    createdBy: string;
  }): CalendarEvent {
    return new CalendarEvent(new UniqueId(params.id), {
      academyId: params.academyId,
      title: params.title,
      description: params.description ?? null,
      eventType: params.eventType ?? null,
      startDate: params.startDate,
      endDate: params.endDate ?? null,
      startTime: params.isAllDay ? null : (params.startTime ?? null),
      endTime: params.isAllDay ? null : (params.endTime ?? null),
      isAllDay: params.isAllDay,
      location: params.location ?? null,
      targetAudience: params.targetAudience ?? null,
      batchIds: params.batchIds ?? [],
      status: params.status,
      createdBy: params.createdBy,
      audit: createAuditFields(),
    });
  }

  static reconstitute(id: string, props: EventProps): CalendarEvent {
    return new CalendarEvent(new UniqueId(id), props);
  }

  get academyId(): string { return this.props.academyId; }
  get title(): string { return this.props.title; }
  get description(): string | null { return this.props.description; }
  get eventType(): EventType | null { return this.props.eventType; }
  get startDate(): Date { return this.props.startDate; }
  get endDate(): Date | null { return this.props.endDate; }
  get startTime(): string | null { return this.props.startTime; }
  get endTime(): string | null { return this.props.endTime; }
  get isAllDay(): boolean { return this.props.isAllDay; }
  get location(): string | null { return this.props.location; }
  get targetAudience(): TargetAudience | null { return this.props.targetAudience; }
  get batchIds(): string[] { return this.props.batchIds; }
  get status(): EventStatus { return this.props.status; }
  get createdBy(): string { return this.props.createdBy; }
  get audit(): AuditFields { return this.props.audit; }

  withUpdatedAudit(): CalendarEvent {
    return CalendarEvent.reconstitute(this.id.toString(), {
      ...this.props,
      audit: updateAuditFields(this.props.audit),
    });
  }
}

/** Derive event status from dates relative to today (IST). */
export function deriveEventStatus(startDate: Date, endDate: Date | null): EventStatus {
  const now = new Date();
  // Use IST date boundaries
  const istOffset = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(now.getTime() + istOffset);
  const todayStr = todayIST.toISOString().slice(0, 10);

  const startIST = new Date(startDate.getTime() + istOffset);
  const startStr = startIST.toISOString().slice(0, 10);
  const endIST = endDate ? new Date(endDate.getTime() + istOffset) : null;
  const endStr = endIST ? endIST.toISOString().slice(0, 10) : startStr;

  if (todayStr < startStr) return 'UPCOMING';
  if (todayStr > endStr) return 'COMPLETED';
  return 'ONGOING';
}

/** Check if a status transition is allowed. */
export function isValidStatusTransition(from: EventStatus, to: EventStatus): boolean {
  // Any → CANCELLED is always allowed
  if (to === 'CANCELLED') return true;
  // UPCOMING or ONGOING → COMPLETED (manual early completion)
  if ((from === 'UPCOMING' || from === 'ONGOING') && to === 'COMPLETED') return true;
  // CANCELLED → UPCOMING (reinstate)
  if (from === 'CANCELLED' && to === 'UPCOMING') return true;
  return false;
}
