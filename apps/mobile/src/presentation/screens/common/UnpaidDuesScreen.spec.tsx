import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { UnpaidDuesScreen } from './UnpaidDuesScreen';
import * as feesApi from '../../../infra/fees/fees-api';
import { ok } from '../../../domain/common/result';
import type { FeeDueItem } from '../../../domain/fees/fees.types';

jest.mock('../../../infra/fees/fees-api', () => ({
  listUnpaidDues: jest.fn(),
  listPaidDues: jest.fn(),
  getStudentFees: jest.fn(),
  markFeePaid: jest.fn(),
}));

const mockMarkFeePaid = feesApi.markFeePaid as jest.Mock;

function makeFeeDue(overrides: Partial<FeeDueItem> = {}): FeeDueItem {
  return {
    id: 'fd1',
    academyId: 'a1',
    studentId: 's1',
    monthKey: '2026-03',
    dueDate: '2026-03-10',
    amount: 500,
    lateFee: 0,
    totalPayable: 500,
    status: 'DUE',
    paidAt: null,
    paidByUserId: null,
    paidSource: null,
    paymentLabel: null,
    collectedByUserId: null,
    approvedByUserId: null,
    paymentRequestId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('UnpaidDuesScreen', () => {
  const defaultProps = {
    items: [makeFeeDue()],
    loading: false,
    error: null,
    onRetry: jest.fn(),
    onRowPress: jest.fn(),
    isOwner: true,
    month: '2026-03',
    onMarkPaidSuccess: jest.fn(),
    studentNameMap: { s1: 'John Doe' } as Record<string, string>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders unpaid fee rows', () => {
    render(<UnpaidDuesScreen {...defaultProps} />);

    expect(screen.getByTestId('fee-row-fd1')).toBeTruthy();
    expect(screen.getByText('DUE')).toBeTruthy();
  });

  it('shows skeleton when loading', () => {
    render(<UnpaidDuesScreen {...defaultProps} loading={true} items={[]} />);

    expect(screen.getByTestId('skeleton-container')).toBeTruthy();
  });

  it('shows empty state when no items', () => {
    render(<UnpaidDuesScreen {...defaultProps} items={[]} />);

    expect(screen.getByText('No unpaid dues for this month')).toBeTruthy();
  });

  it('shows error with retry', () => {
    render(
      <UnpaidDuesScreen
        {...defaultProps}
        items={[]}
        error={{ code: 'NETWORK', message: 'Network error' }}
      />,
    );

    expect(screen.getByText('Network error')).toBeTruthy();
    expect(screen.getByTestId('retry-button')).toBeTruthy();
  });

  it('owner can mark paid with confirmation', async () => {
    mockMarkFeePaid.mockResolvedValue(
      ok({
        ...makeFeeDue(),
        status: 'PAID',
        paidAt: '2026-03-04T10:00:00.000Z',
        paidSource: 'OWNER_DIRECT',
      }),
    );

    render(<UnpaidDuesScreen {...defaultProps} />);

    fireEvent.press(screen.getByTestId('fee-row-fd1'));

    await waitFor(() => {
      expect(screen.getByTestId('mark-paid-confirm')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-ok'));
    });

    await waitFor(() => {
      expect(mockMarkFeePaid).toHaveBeenCalledWith('s1', '2026-03');
    });
  });

  it('staff taps row to navigate', () => {
    const onRowPress = jest.fn();
    render(<UnpaidDuesScreen {...defaultProps} isOwner={false} onRowPress={onRowPress} />);

    fireEvent.press(screen.getByTestId('fee-row-fd1'));

    expect(onRowPress).toHaveBeenCalledWith('s1');
  });
});
