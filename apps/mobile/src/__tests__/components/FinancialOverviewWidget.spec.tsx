import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FinancialOverviewWidget } from '../../presentation/components/dashboard/FinancialOverviewWidget';

// The current-month path is served by initialData, so load() never fetches;
// mock the API anyway to avoid pulling the real HTTP client into the test.
jest.mock('../../infra/dashboard/dashboard-api', () => ({
  getOwnerDashboard: jest.fn(),
}));

describe('FinancialOverviewWidget', () => {
  // Values chosen so none of {collected, pending, expenses, lateFees, netProfit}
  // collide before/after (netProfit = collected - expenses).
  const first = { collected: 50000, pending: 20000, expenses: 5000, lateFees: 1000 };
  const refreshed = { collected: 70000, pending: 30000, expenses: 8000, lateFees: 2000 };

  it('updates the displayed figures when refreshed initialData is passed (no first-load freeze)', () => {
    const { rerender } = render(<FinancialOverviewWidget initialData={first} />);

    expect(screen.getByText('₹50,000')).toBeTruthy(); // Collected
    expect(screen.getByText('₹20,000')).toBeTruthy(); // Pending

    // Simulate pull-to-refresh: the dashboard passes new numbers down.
    rerender(<FinancialOverviewWidget initialData={refreshed} />);

    expect(screen.getByText('₹70,000')).toBeTruthy(); // Collected updated
    expect(screen.getByText('₹30,000')).toBeTruthy(); // Pending updated
    // Old (frozen) values must be gone.
    expect(screen.queryByText('₹50,000')).toBeNull();
    expect(screen.queryByText('₹20,000')).toBeNull();
  });
});
