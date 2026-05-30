import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { UnpaidDuesScreen } from './UnpaidDuesScreen';
import type { FeeDueItem } from '../../../domain/fees/fees.types';

jest.mock('../../../infra/fees/fees-api', () => ({
  listUnpaidDues: jest.fn(),
  listPaidDues: jest.fn(),
  getStudentFees: jest.fn(),
  markFeePaid: jest.fn(),
}));

function makeFeeDue(overrides: Partial<FeeDueItem> = {}): FeeDueItem {
  return {
    id: 'fd1',
    academyId: 'a1',
    studentId: 's1',
    studentName: 'Test Student',
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
    // The row shows the resolved student name (from studentNameMap).
    expect(screen.getByText('John Doe')).toBeTruthy();
  });

  it('shows the contact phone and the total unpaid-months count on a row', () => {
    render(
      <UnpaidDuesScreen
        {...defaultProps}
        items={[makeFeeDue({ studentPhone: '+919812345678', unpaidMonthsCount: 3 })]}
      />,
    );

    expect(screen.getByText('3 months')).toBeTruthy();
    expect(screen.getByText('+919812345678')).toBeTruthy();
  });

  it('uses the singular "1 month" when a student owes a single month', () => {
    render(
      <UnpaidDuesScreen {...defaultProps} items={[makeFeeDue({ unpaidMonthsCount: 1 })]} />,
    );

    expect(screen.getByText('1 month')).toBeTruthy();
  });

  it('omits the months badge and phone when those fields are absent', () => {
    render(<UnpaidDuesScreen {...defaultProps} items={[makeFeeDue()]} />);

    expect(screen.queryByText(/month(s)?$/)).toBeNull();
    expect(screen.queryByTestId('fee-row-call-fd1')).toBeNull();
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

  it('owner taps row to navigate to student fee detail', () => {
    const onRowPress = jest.fn();
    render(<UnpaidDuesScreen {...defaultProps} onRowPress={onRowPress} />);

    fireEvent.press(screen.getByTestId('fee-row-fd1'));

    expect(onRowPress).toHaveBeenCalledWith('s1');
  });

  it('staff taps row to navigate', () => {
    const onRowPress = jest.fn();
    render(<UnpaidDuesScreen {...defaultProps} onRowPress={onRowPress} />);

    fireEvent.press(screen.getByTestId('fee-row-fd1'));

    expect(onRowPress).toHaveBeenCalledWith('s1');
  });
});
