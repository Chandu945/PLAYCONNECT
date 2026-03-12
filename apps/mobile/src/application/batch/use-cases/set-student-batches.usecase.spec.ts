import { setStudentBatchesUseCase } from './set-student-batches.usecase';
import type { SetStudentBatchesDeps } from './set-student-batches.usecase';
import type { BatchListItem } from '../../../domain/batch/batch.types';
import { ok, err } from '../../../domain/common/result';

const mockBatches: BatchListItem[] = [
  {
    id: 'batch-1',
    academyId: 'academy-1',
    batchName: 'Morning',
    days: ['MON', 'WED', 'FRI'],
    notes: null,
    profilePhotoUrl: null,
    startTime: null,
    endTime: null,
    maxStudents: null,
    status: 'ACTIVE',
    studentCount: 5,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

function makeDeps(overrides?: Partial<SetStudentBatchesDeps['batchApi']>): SetStudentBatchesDeps {
  return {
    batchApi: {
      setStudentBatches: jest.fn().mockResolvedValue(ok(mockBatches)),
      ...overrides,
    },
  };
}

describe('setStudentBatchesUseCase', () => {
  it('should return batches on success', async () => {
    const deps = makeDeps();
    const result = await setStudentBatchesUseCase(deps, 'student-1', ['batch-1']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.id).toBe('batch-1');
    }
    expect(deps.batchApi.setStudentBatches).toHaveBeenCalledWith('student-1', ['batch-1']);
  });

  it('should propagate API error', async () => {
    const deps = makeDeps({
      setStudentBatches: jest.fn().mockResolvedValue(err({ code: 'FORBIDDEN', message: 'Nope' })),
    });
    const result = await setStudentBatchesUseCase(deps, 'student-1', ['batch-1']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('should return error for invalid server response', async () => {
    const deps = makeDeps({
      setStudentBatches: jest.fn().mockResolvedValue(ok([{ invalid: true }])),
    });
    const result = await setStudentBatchesUseCase(deps, 'student-1', ['batch-1']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN');
    }
  });
});
