import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AuthContext } from '../../context/AuthContext';
import type { AuthContextValue, AuthPhase } from '../../context/AuthContext';
import type { SubscriptionInfo } from '../../../domain/subscription/subscription.types';
import { SubscriptionScreen } from './SubscriptionScreen';

const TIERS = [
  { tierKey: 'TIER_0_50' as const, min: 0, max: 50, priceInr: 299 },
  { tierKey: 'TIER_51_100' as const, min: 51, max: 100, priceInr: 499 },
  { tierKey: 'TIER_101_PLUS' as const, min: 101, max: null, priceInr: 699 },
];

function makeSub(overrides: Partial<SubscriptionInfo> = {}): SubscriptionInfo {
  return {
    status: 'TRIAL',
    trialEndAt: '2026-04-01T00:00:00Z',
    paidEndAt: null,
    tierKey: null,
    daysRemaining: 28,
    canAccessApp: true,
    blockReason: null,
    activeStudentCount: 15,
    currentTierKey: null,
    requiredTierKey: 'TIER_0_50',
    pendingTierChange: null,
    tiers: TIERS,
    ...overrides,
  };
}

function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    phase: 'ready' as AuthPhase,
    user: {
      id: 'u1',
      fullName: 'Owner',
      email: 'o@test.com',
      phoneNumber: '+919876543210',
      role: 'OWNER',
      status: 'ACTIVE',
    },
    subscription: makeSub(),
    login: jest.fn().mockResolvedValue(null),
    signup: jest.fn().mockResolvedValue(null),
    setupAcademy: jest.fn().mockResolvedValue(null),
    logout: jest.fn(),
    refreshSubscription: jest.fn(),
    ...overrides,
  };
}

function renderScreen(auth: AuthContextValue) {
  return render(
    <AuthContext.Provider value={auth}>
      <SubscriptionScreen />
    </AuthContext.Provider>,
  );
}

describe('SubscriptionScreen', () => {
  it('shows loading when no subscription', () => {
    renderScreen(makeAuth({ subscription: null }));
    expect(screen.getByText('Loading subscription...')).toBeTruthy();
  });

  it('displays status card with trial info', () => {
    renderScreen(makeAuth());
    expect(screen.getByTestId('status-card')).toBeTruthy();
    expect(screen.getByTestId('status-badge')).toBeTruthy();
    expect(screen.getByText('28')).toBeTruthy(); // daysRemaining
  });

  it('displays tier info with active student count', () => {
    renderScreen(makeAuth());
    expect(screen.getByText('Active Students')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('displays pricing table with 3 tiers', () => {
    renderScreen(makeAuth());
    expect(screen.getByTestId('tier-row-TIER_0_50')).toBeTruthy();
    expect(screen.getByTestId('tier-row-TIER_51_100')).toBeTruthy();
    expect(screen.getByTestId('tier-row-TIER_101_PLUS')).toBeTruthy();
    // Verify pricing values are rendered
    expect(screen.getAllByText(/299/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/499/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/699/).length).toBeGreaterThan(0);
  });

  it('shows upgrade banner when tier mismatch', () => {
    renderScreen(
      makeAuth({
        subscription: makeSub({
          currentTierKey: 'TIER_0_50',
          requiredTierKey: 'TIER_51_100',
          activeStudentCount: 75,
          pendingTierChange: {
            tierKey: 'TIER_51_100',
            effectiveAt: '2026-10-01T00:00:00Z',
          },
        }),
      }),
    );
    expect(screen.getByTestId('upgrade-banner')).toBeTruthy();
    expect(screen.getByText('Tier Change Required')).toBeTruthy();
  });

  it('does not show upgrade banner when tiers match', () => {
    renderScreen(
      makeAuth({
        subscription: makeSub({
          currentTierKey: 'TIER_0_50',
          requiredTierKey: 'TIER_0_50',
        }),
      }),
    );
    expect(screen.queryByTestId('upgrade-banner')).toBeNull();
  });

  it('shows block reason when present', () => {
    renderScreen(
      makeAuth({
        subscription: makeSub({
          status: 'BLOCKED',
          canAccessApp: false,
          blockReason: 'Trial expired',
          daysRemaining: 0,
        }),
      }),
    );
    expect(screen.getByText('Trial expired')).toBeTruthy();
  });

  it('shows sign out button when blocked', () => {
    renderScreen(
      makeAuth({
        subscription: makeSub({
          status: 'BLOCKED',
          canAccessApp: false,
          daysRemaining: 0,
        }),
      }),
    );
    expect(screen.getByTestId('subscription-logout')).toBeTruthy();
  });

  it('hides sign out button when not blocked', () => {
    renderScreen(makeAuth());
    expect(screen.queryByTestId('subscription-logout')).toBeNull();
  });

  it('calls refreshSubscription on refresh press', async () => {
    const refreshMock = jest.fn();
    renderScreen(makeAuth({ refreshSubscription: refreshMock }));

    fireEvent.press(screen.getByTestId('subscription-refresh'));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it('calls logout on sign out press when blocked', () => {
    const logoutMock = jest.fn();
    renderScreen(
      makeAuth({
        logout: logoutMock,
        subscription: makeSub({
          status: 'BLOCKED',
          canAccessApp: false,
          daysRemaining: 0,
        }),
      }),
    );

    fireEvent.press(screen.getByTestId('subscription-logout'));
    expect(logoutMock).toHaveBeenCalled();
  });

  // ── DISABLED state (academy login disabled by admin) ──

  it('shows Disabled badge when status is DISABLED', () => {
    renderScreen(
      makeAuth({
        subscription: makeSub({
          status: 'DISABLED',
          canAccessApp: false,
          daysRemaining: 0,
          blockReason: 'Academy access has been disabled by administrator',
        }),
      }),
    );
    expect(screen.getByTestId('status-badge')).toBeTruthy();
    expect(screen.getByText('Academy access has been disabled by administrator')).toBeTruthy();
  });

  it('shows sign out button when DISABLED', () => {
    renderScreen(
      makeAuth({
        subscription: makeSub({
          status: 'DISABLED',
          canAccessApp: false,
          daysRemaining: 0,
        }),
      }),
    );
    expect(screen.getByTestId('subscription-logout')).toBeTruthy();
  });

  it('calls logout on sign out press when DISABLED', () => {
    const logoutMock = jest.fn();
    renderScreen(
      makeAuth({
        logout: logoutMock,
        subscription: makeSub({
          status: 'DISABLED',
          canAccessApp: false,
          daysRemaining: 0,
        }),
      }),
    );

    fireEvent.press(screen.getByTestId('subscription-logout'));
    expect(logoutMock).toHaveBeenCalled();
  });
});
