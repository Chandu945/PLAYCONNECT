import type { Weekday } from '@playconnect/contracts';

export type { Weekday };

export type BatchStatus = 'ACTIVE' | 'INACTIVE';

export type BatchListItem = {
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
  studentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateBatchRequest = {
  batchName: string;
  days?: Weekday[];
  notes?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  maxStudents?: number | null;
};

export type UpdateBatchRequest = Partial<CreateBatchRequest> & {
  status?: BatchStatus;
};

export type SetStudentBatchesRequest = {
  batchIds: string[];
};
