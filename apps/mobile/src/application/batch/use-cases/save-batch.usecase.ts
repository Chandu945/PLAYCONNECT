import type { AppError } from '../../../domain/common/errors';
import type { Result } from '../../../domain/common/result';
import { err } from '../../../domain/common/result';
import type { CreateBatchRequest, UpdateBatchRequest } from '../../../domain/batch/batch.types';

export type SaveBatchApiPort = {
  createBatch(req: CreateBatchRequest): Promise<Result<unknown, AppError>>;
  updateBatch(id: string, req: UpdateBatchRequest): Promise<Result<unknown, AppError>>;
};

export type SaveBatchDeps = {
  saveApi: SaveBatchApiPort;
};

export function validateBatchForm(fields: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!fields['batchName']?.trim()) {
    errors['batchName'] = 'Batch name is required';
  } else if (fields['batchName']!.trim().length < 2) {
    errors['batchName'] = 'Batch name must be at least 2 characters';
  } else if (fields['batchName']!.trim().length > 60) {
    errors['batchName'] = 'Batch name must not exceed 60 characters';
  }

  // days is optional — no validation required

  const timeRegex = /^\d{2}:\d{2}$/;
  const st = fields['startTime']?.trim();
  const et = fields['endTime']?.trim();

  if (st) {
    if (!timeRegex.test(st)) {
      errors['startTime'] = 'Start time must be in HH:MM format';
    } else {
      const [h, m] = st.split(':').map(Number);
      if (h! < 0 || h! > 23 || m! < 0 || m! > 59) {
        errors['startTime'] = 'Invalid start time';
      }
    }
  }

  if (et) {
    if (!timeRegex.test(et)) {
      errors['endTime'] = 'End time must be in HH:MM format';
    } else {
      const [h, m] = et.split(':').map(Number);
      if (h! < 0 || h! > 23 || m! < 0 || m! > 59) {
        errors['endTime'] = 'Invalid end time';
      }
    }
  }

  if (st && et && !errors['startTime'] && !errors['endTime']) {
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    if (eh! * 60 + em! <= sh! * 60 + sm!) {
      errors['endTime'] = 'End time must be after start time';
    }
  }

  const ms = fields['maxStudents']?.trim();
  if (ms) {
    const n = parseInt(ms, 10);
    if (isNaN(n) || !Number.isInteger(n) || n < 1) {
      errors['maxStudents'] = 'Max students must be a positive integer';
    }
  }

  if (fields['notes'] && fields['notes'].length > 500) {
    errors['notes'] = 'Notes must not exceed 500 characters';
  }

  return errors;
}

export async function saveBatchUseCase(
  deps: SaveBatchDeps,
  mode: 'create' | 'edit',
  batchId: string | undefined,
  data: CreateBatchRequest,
): Promise<Result<unknown, AppError>> {
  if (mode === 'edit' && batchId) {
    return deps.saveApi.updateBatch(batchId, data);
  }
  if (mode === 'create') {
    return deps.saveApi.createBatch(data);
  }
  return err({ code: 'UNKNOWN', message: 'Invalid mode' });
}
