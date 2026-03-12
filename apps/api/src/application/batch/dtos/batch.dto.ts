import type { Weekday } from '@playconnect/contracts';
import type { Batch, BatchStatus } from '@domain/batch/entities/batch.entity';

export interface BatchDto {
  id: string;
  academyId: string;
  batchName: string;
  days: Weekday[];
  notes: string | null;
  profilePhotoUrl: string | null;
  startTime: string | null;
  endTime: string | null;
  maxStudents: number | null;
  status: BatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export function toBatchDto(batch: Batch): BatchDto {
  return {
    id: batch.id.toString(),
    academyId: batch.academyId,
    batchName: batch.batchName,
    days: batch.days,
    notes: batch.notes,
    profilePhotoUrl: batch.profilePhotoUrl,
    startTime: batch.startTime,
    endTime: batch.endTime,
    maxStudents: batch.maxStudents,
    status: batch.status,
    createdAt: batch.audit.createdAt,
    updatedAt: batch.audit.updatedAt,
  };
}
