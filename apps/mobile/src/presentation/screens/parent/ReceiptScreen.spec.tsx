import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ReceiptScreen } from './ReceiptScreen';

const mockGetReceipt = jest.fn();
jest.mock('../../../application/parent/use-cases/get-receipt.usecase', () => ({
  getReceiptUseCase: (...args: unknown[]) => mockGetReceipt(...args),
}));
jest.mock('../../../infra/parent/parent-api', () => ({ parentApi: {} }));

describe('ReceiptScreen — late fee is not double-counted', () => {
  it('shows base fee, late fee, and total separately', async () => {
    mockGetReceipt.mockResolvedValue({
      ok: true,
      value: {
        receiptNumber: 'RCP-1',
        studentName: 'Test Student',
        academyName: 'Test Academy',
        monthKey: '2026-04',
        amount: 1700, // gross collected = base 1500 + late 200
        lateFeeApplied: 200,
        paidAt: '2026-04-15T10:00:00.000Z',
        paymentMethod: 'Direct Payment',
      },
    });

    render(<ReceiptScreen />);

    // "Fee Amount" must be the BASE (₹1,500), not the gross (₹1,700).
    expect(await screen.findByText('₹1,500')).toBeTruthy();
    expect(screen.getByText('₹200')).toBeTruthy(); // Late Fee
    expect(screen.getByText('₹1,700')).toBeTruthy(); // Total Paid
  });
});
