import type { AuditFields } from '@shared/kernel';
import { Entity, UniqueId, createAuditFields } from '@shared/kernel';
import type { Weekday } from '@playconnect/contracts';

export type BatchStatus = 'ACTIVE' | 'INACTIVE';

export interface BatchProps {
  academyId: string;
  batchName: string;
  batchNameNormalized: string;
  days: Weekday[];
  notes: string | null;
  profilePhotoUrl: string | null;
  startTime: string | null;
  endTime: string | null;
  maxStudents: number | null;
  status: BatchStatus;
  audit: AuditFields;
}

export class Batch extends Entity<BatchProps> {
  private constructor(id: UniqueId, props: BatchProps) {
    super(id, props);
  }

  static create(params: {
    id: string;
    academyId: string;
    batchName: string;
    days?: Weekday[];
    notes?: string | null;
    profilePhotoUrl?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    maxStudents?: number | null;
  }): Batch {
    const trimmedName = params.batchName.trim();
    return new Batch(new UniqueId(params.id), {
      academyId: params.academyId,
      batchName: trimmedName,
      batchNameNormalized: trimmedName.toLowerCase(),
      days: [...new Set(params.days ?? [])],
      notes: params.notes ?? null,
      profilePhotoUrl: params.profilePhotoUrl ?? null,
      startTime: params.startTime ?? null,
      endTime: params.endTime ?? null,
      maxStudents: params.maxStudents ?? null,
      status: 'ACTIVE',
      audit: createAuditFields(),
    });
  }

  static reconstitute(id: string, props: BatchProps): Batch {
    return new Batch(new UniqueId(id), props);
  }

  get academyId(): string {
    return this.props.academyId;
  }

  get batchName(): string {
    return this.props.batchName;
  }

  get batchNameNormalized(): string {
    return this.props.batchNameNormalized;
  }

  get days(): Weekday[] {
    return this.props.days;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get profilePhotoUrl(): string | null {
    return this.props.profilePhotoUrl;
  }

  get startTime(): string | null {
    return this.props.startTime;
  }

  get endTime(): string | null {
    return this.props.endTime;
  }

  get maxStudents(): number | null {
    return this.props.maxStudents;
  }

  get status(): BatchStatus {
    return this.props.status;
  }

  get audit(): AuditFields {
    return this.props.audit;
  }
}
