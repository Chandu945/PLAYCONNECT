import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../infra/batch/batch-api', () => ({
  listBatches: jest.fn(),
}));

import { listBatches } from '../../../infra/batch/batch-api';
import { BatchesListScreen } from '../../../presentation/screens/batches/BatchesListScreen';

const mockListBatches = listBatches as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BatchesListScreen', () => {
  it('renders loading state then batches', async () => {
    mockListBatches.mockResolvedValue({
      ok: true,
      value: {
        data: [
          {
            id: 'b1',
            academyId: 'a1',
            batchName: 'Morning',
            days: ['MON', 'WED', 'FRI'],
            notes: null,
            profilePhotoUrl: null,
            status: 'ACTIVE',
            studentCount: 3,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
    });

    render(<BatchesListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Morning')).toBeTruthy();
    });
  });

  it('shows empty state when no batches', async () => {
    mockListBatches.mockResolvedValue({
      ok: true,
      value: {
        data: [],
        meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      },
    });

    render(<BatchesListScreen />);

    await waitFor(() => {
      expect(screen.getByText('No batches found')).toBeTruthy();
    });
  });

  it('shows error on API failure', async () => {
    mockListBatches.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK', message: 'Network error' },
    });

    render(<BatchesListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  it('navigates to add batch form', async () => {
    mockListBatches.mockResolvedValue({
      ok: true,
      value: {
        data: [],
        meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      },
    });

    render(<BatchesListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('add-batch-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('add-batch-button'));
    expect(mockNavigate).toHaveBeenCalledWith('BatchForm', { mode: 'create' });
  });

  it('navigates to detail on row press', async () => {
    const batch = {
      id: 'b1',
      academyId: 'a1',
      batchName: 'Morning',
      days: ['MON', 'WED', 'FRI'],
      notes: null,
      profilePhotoUrl: null,
      status: 'ACTIVE',
      studentCount: 3,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    mockListBatches.mockResolvedValue({
      ok: true,
      value: {
        data: [batch],
        meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      },
    });

    render(<BatchesListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('batch-row-b1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('batch-row-b1'));
    expect(mockNavigate).toHaveBeenCalledWith('BatchDetail', { batch });
  });
});
