import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BatchPickerSheet } from './BatchPickerSheet';
import type { BatchListItem } from '../../../domain/batch/batch.types';

jest.mock('react-native-linear-gradient', () => 'LinearGradient');

const mk = (id: string, name: string, days: string[]): BatchListItem =>
  ({ id, batchName: name, days, startTime: '06:00', endTime: '08:00' }) as unknown as BatchListItem;

const baseProps = {
  visible: true,
  loading: false,
  selectedBatchId: null,
  onSelect: jest.fn(),
  onClose: jest.fn(),
};

describe('BatchPickerSheet — today grouping', () => {
  it('splits batches running on the selected day into the AVAILABLE TODAY group', () => {
    const batches = [
      mk('b1', 'Morning', ['MON', 'SAT']), // runs Saturday → today group (purple card)
      mk('b2', 'Weekday Only', ['MON', 'TUE']), // not Saturday → other group
    ];
    render(
      <BatchPickerSheet {...baseProps} batches={batches} selectedWeekday="SAT" isSelectedToday />,
    );

    // The purple card + header carry the "today" meaning (no per-row pill).
    expect(screen.getByText('AVAILABLE TODAY')).toBeTruthy();
    expect(screen.getByText('OTHER BATCHES')).toBeTruthy();
    expect(screen.getByTestId('batch-picker-b1')).toBeTruthy();
    expect(screen.getByTestId('batch-picker-b2')).toBeTruthy();
  });

  it('reflects the selected weekday in the header (not "today") when marking another day', () => {
    render(
      <BatchPickerSheet
        {...baseProps}
        batches={[mk('b1', 'Morning', ['SAT'])]}
        selectedWeekday="SAT"
        isSelectedToday={false}
      />,
    );

    expect(screen.getByText('RUNS ON SATURDAY')).toBeTruthy();
  });

  it('surfaces the session time on a today row and drops the "Selected" pill', () => {
    render(
      <BatchPickerSheet
        {...baseProps}
        batches={[mk('b1', 'Morning', ['SAT'])]}
        selectedBatchId="b1"
        selectedWeekday="SAT"
        isSelectedToday
      />,
    );

    // Session time is shown (mk defaults 06:00–08:00) as the right-side accent.
    expect(screen.getByText(/06:00.*08:00/)).toBeTruthy();
    // The check-avatar + row fill convey selection — no redundant text pill.
    expect(screen.queryByText('Selected')).toBeNull();
  });

  it('shows a hint and labels the rest "ALL BATCHES" when nothing runs that day', () => {
    render(
      <BatchPickerSheet
        {...baseProps}
        batches={[mk('b1', 'Morning', ['MON'])]}
        selectedWeekday="SAT"
        isSelectedToday
      />,
    );

    expect(screen.getByText('No batch is scheduled for this day.')).toBeTruthy();
    expect(screen.getByText('ALL BATCHES')).toBeTruthy();
  });
});
