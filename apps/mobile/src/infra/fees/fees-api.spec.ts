import { listUnpaidDues, listPaidDues, getStudentFees, markFeePaid } from './fees-api';
import * as apiClient from '../http/api-client';
import { ok } from '../../domain/common/result';

jest.mock('../http/api-client', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPut: jest.fn(),
  apiDelete: jest.fn(),
}));

const mockApiGet = apiClient.apiGet as jest.Mock;
const mockApiPut = apiClient.apiPut as jest.Mock;

describe('fees-api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listUnpaidDues', () => {
    it('builds URL with month and pagination', async () => {
      mockApiGet.mockResolvedValue(ok({ items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }));

      await listUnpaidDues('2026-03');

      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/fees/dues?month=2026-03&page=1&pageSize=20');
    });

    it('passes custom page and pageSize', async () => {
      mockApiGet.mockResolvedValue(ok({ items: [], meta: { page: 2, pageSize: 10, total: 15, totalPages: 2 } }));

      await listUnpaidDues('2026-03', 2, 10);

      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/fees/dues?month=2026-03&page=2&pageSize=10');
    });
  });

  describe('listPaidDues', () => {
    it('builds URL with month', async () => {
      mockApiGet.mockResolvedValue(ok([]));

      await listPaidDues('2026-03');

      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/fees/paid?month=2026-03');
    });
  });

  describe('getStudentFees', () => {
    it('builds URL with studentId, from, and to', async () => {
      mockApiGet.mockResolvedValue(ok([]));

      await getStudentFees('s1', '2026-01', '2026-03');

      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/fees/students/s1?from=2026-01&to=2026-03');
    });

    it('omits the query string entirely when no range is given (full history)', async () => {
      mockApiGet.mockResolvedValue(ok([]));

      await getStudentFees('s1');

      expect(mockApiGet).toHaveBeenCalledWith('/api/v1/fees/students/s1');
    });
  });

  describe('markFeePaid', () => {
    it('sends PUT to correct endpoint', async () => {
      mockApiPut.mockResolvedValue(ok({}));

      await markFeePaid('s1', '2026-03');

      expect(mockApiPut).toHaveBeenCalledWith('/api/v1/fees/students/s1/2026-03/pay', undefined);
    });
  });
});
