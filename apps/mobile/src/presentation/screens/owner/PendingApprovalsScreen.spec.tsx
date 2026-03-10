import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PendingApprovalsScreen } from './PendingApprovalsScreen';
import * as paymentRequestsApi from '../../../infra/fees/payment-requests-api';
import { ok, err } from '../../../domain/common/result';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../../../infra/fees/payment-requests-api', () => ({
  listPaymentRequests: jest.fn(),
  createPaymentRequest: jest.fn(),
  cancelPaymentRequest: jest.fn(),
  approvePaymentRequest: jest.fn(),
  rejectPaymentRequest: jest.fn(),
}));

const mockListRequests = paymentRequestsApi.listPaymentRequests as jest.Mock;
const mockApprove = paymentRequestsApi.approvePaymentRequest as jest.Mock;

function makeRequest(overrides = {}) {
  return {
    id: 'pr1',
    academyId: 'a1',
    studentId: 's1',
    studentName: 'John Doe',
    feeDueId: 'fd1',
    monthKey: '2026-03',
    amount: 500,
    staffUserId: 'u2',
    staffName: 'Staff User',
    staffNotes: 'Collected cash from guardian',
    status: 'PENDING',
    reviewedByUserId: null,
    reviewedByName: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
    ...overrides,
  };
}

describe('PendingApprovalsScreen', () => {
  const onActionComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function paginated(items: ReturnType<typeof makeRequest>[]) {
    return {
      data: items,
      meta: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
    };
  }

  it('shows skeleton on load', async () => {
    let resolvePromise: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockListRequests.mockReturnValue(pending);

    render(<PendingApprovalsScreen onActionComplete={onActionComplete} />);

    expect(screen.getByTestId('skeleton-container')).toBeTruthy();

    await act(async () => {
      resolvePromise!(ok(paginated([makeRequest()])));
    });
  });

  it('renders pending requests', async () => {
    mockListRequests.mockResolvedValue(ok(paginated([makeRequest()])));

    render(<PendingApprovalsScreen onActionComplete={onActionComplete} />);

    await waitFor(() => {
      expect(screen.getByTestId('request-row-pr1')).toBeTruthy();
    });

    expect(screen.getByText('Collected cash from guardian')).toBeTruthy();
  });

  it('shows empty state when no requests', async () => {
    mockListRequests.mockResolvedValue(ok(paginated([])));

    render(<PendingApprovalsScreen onActionComplete={onActionComplete} />);

    await waitFor(() => {
      expect(screen.getByText('No pending approvals')).toBeTruthy();
    });
  });

  it('approve triggers confirmation and calls API', async () => {
    mockListRequests.mockResolvedValue(ok(paginated([makeRequest()])));
    mockApprove.mockResolvedValue(ok(makeRequest({ status: 'APPROVED' })));

    render(<PendingApprovalsScreen onActionComplete={onActionComplete} />);

    await waitFor(() => {
      expect(screen.getByTestId('approve-pr1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('approve-pr1'));

    await waitFor(() => {
      expect(screen.getByTestId('approval-confirm')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-ok'));
    });

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('pr1');
    });
  });

  it('shows error on API failure', async () => {
    mockListRequests.mockResolvedValue(err({ code: 'NETWORK', message: 'Network error' }));

    render(<PendingApprovalsScreen onActionComplete={onActionComplete} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });
});
