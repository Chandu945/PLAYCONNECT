import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PaymentStatusBanner } from '../../components/subscription/PaymentStatusBanner';
import { PayWithCashfreeButton } from '../../components/subscription/PayWithCashfreeButton';
import { usePaymentFlow } from '../../../application/subscription/use-payment-flow';
import type {
  TierPricing,
  PendingTierChange,
  TierKey,
} from '../../../domain/subscription/subscription.types';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type StatusVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

function statusVariant(status: string): StatusVariant {
  switch (status) {
    case 'ACTIVE_PAID':
      return 'success';
    case 'TRIAL':
      return 'info';
    case 'EXPIRED_GRACE':
      return 'warning';
    case 'BLOCKED':
    case 'DISABLED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE_PAID':
      return 'Active';
    case 'TRIAL':
      return 'Trial';
    case 'EXPIRED_GRACE':
      return 'Grace Period';
    case 'BLOCKED':
      return 'Blocked';
    case 'DISABLED':
      return 'Disabled';
    default:
      return status;
  }
}

function tierLabel(tierKey: TierKey | null): string {
  switch (tierKey) {
    case 'TIER_0_50':
      return '0\u201350 students';
    case 'TIER_51_100':
      return '51\u2013100 students';
    case 'TIER_101_PLUS':
      return '101+ students';
    default:
      return 'No tier';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/* ── Row helpers ──────────────────────────────────────────────────────────── */

function InfoRow({
  label,
  value,
  isLast,
  colors,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
  colors: Colors;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      {typeof value === 'string' ? <Text style={styles.infoValue}>{value}</Text> : value}
    </View>
  );
}

/* ── Tier row ─────────────────────────────────────────────────────────────── */

function TierRow({
  tier,
  isCurrent,
  isRequired,
  isLast,
}: {
  tier: TierPricing;
  isCurrent: boolean;
  isRequired: boolean;
  isLast: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View
      style={[
        styles.tierRow,
        !isLast && styles.tierRowBorder,
        isRequired && !isCurrent && styles.tierRowHighlight,
      ]}
      testID={`tier-row-${tier.tierKey}`}
    >
      <View style={styles.tierLeft}>
        <Text style={[styles.tierRange, isRequired && !isCurrent && styles.tierRangeHighlight]}>
          {tier.min}{'\u2013'}{tier.max ?? '\u221E'} students
        </Text>
        {isCurrent ? <Badge label="Current" variant="info" /> : null}
        {isRequired && !isCurrent ? <Badge label="Required" variant="warning" /> : null}
      </View>
      <Text style={[styles.tierPrice, isRequired && !isCurrent && styles.tierPriceHighlight]}>
        {'\u20B9'}{tier.priceInr}/mo
      </Text>
    </View>
  );
}

/* ── Upgrade banner ──────────────────────────────────────────────────────── */

function UpgradeBanner({
  pendingChange,
  requiredTierKey,
  currentTierKey,
}: {
  pendingChange: PendingTierChange | null;
  requiredTierKey: TierKey;
  currentTierKey: TierKey | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (requiredTierKey === currentTierKey) return null;

  return (
    <View style={styles.upgradeBanner} testID="upgrade-banner">
      <Text style={styles.upgradeBannerTitle}>Tier Change Required</Text>
      <Text style={styles.upgradeBannerText}>
        Your active student count requires the{' '}
        <Text style={styles.upgradeBannerBold}>{tierLabel(requiredTierKey)}</Text> tier.
      </Text>
      {pendingChange ? (
        <Text style={[styles.upgradeBannerText, { marginTop: spacing.xs }]}>
          Change to {tierLabel(pendingChange.tierKey)} effective{' '}
          {formatDate(pendingChange.effectiveAt)}.
        </Text>
      ) : null}
    </View>
  );
}

/* ── Main screen ─────────────────────────────────────────────────────────── */

export function SubscriptionScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { subscription, logout, refreshSubscription, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshSubscription();
    setRefreshing(false);
  }, [refreshSubscription]);

  const paymentFlow = usePaymentFlow(handleRefresh);

  if (!subscription) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading subscription...</Text>
        </View>
      </Screen>
    );
  }

  const isBlocked = !subscription.canAccessApp;

  return (
    <Screen scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status card ─────────────────────────────────────────────── */}
        <View style={styles.card} testID="status-card">
          <Text style={styles.sectionTitle}>Subscription</Text>

          <InfoRow
            label="Status"
            value={
              <Badge
                label={statusLabel(subscription.status)}
                variant={statusVariant(subscription.status)}
                testID="status-badge"
              />
            }
            colors={colors}
          />
          <InfoRow label="Days Remaining" value={String(subscription.daysRemaining)} colors={colors} />

          {subscription.trialEndAt ? (
            <InfoRow label="Trial Ends" value={formatDate(subscription.trialEndAt)} colors={colors} />
          ) : null}

          {subscription.paidEndAt ? (
            <InfoRow label="Paid Until" value={formatDate(subscription.paidEndAt)} colors={colors} />
          ) : null}

          <InfoRow label="Active Students" value={String(subscription.activeStudentCount)} colors={colors} />
          <InfoRow label="Current Tier" value={tierLabel(subscription.currentTierKey)} colors={colors} />
          <InfoRow
            label="Required Tier"
            value={tierLabel(subscription.requiredTierKey)}
            isLast
            colors={colors}
          />

          {subscription.blockReason ? (
            <View style={styles.blockReasonBox}>
              <Text style={styles.blockReasonText}>{subscription.blockReason}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Upgrade banner ──────────────────────────────────────────── */}
        <UpgradeBanner
          pendingChange={subscription.pendingTierChange}
          requiredTierKey={subscription.requiredTierKey}
          currentTierKey={subscription.currentTierKey}
        />

        {/* ── Payment banner / CTA ────────────────────────────────────── */}
        <PaymentStatusBanner status={paymentFlow.status} error={paymentFlow.error} />

        {user?.role === 'OWNER' &&
          subscription.status !== 'ACTIVE_PAID' &&
          subscription.status !== 'DISABLED' && (
            <PayWithCashfreeButton
              status={paymentFlow.status}
              tierLabel={tierLabel(subscription.requiredTierKey)}
              amountInr={
                subscription.tiers.find((t) => t.tierKey === subscription.requiredTierKey)
                  ?.priceInr ?? 299
              }
              onPress={paymentFlow.startPayment}
              onRetry={paymentFlow.reset}
            />
          )}

        {/* ── Pricing table ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pricing Plans</Text>
          {subscription.tiers.map((tier, index) => (
            <TierRow
              key={tier.tierKey}
              tier={tier}
              isCurrent={tier.tierKey === subscription.currentTierKey}
              isRequired={tier.tierKey === subscription.requiredTierKey}
              isLast={index === subscription.tiers.length - 1}
            />
          ))}
        </View>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <Button
            title="Refresh Status"
            variant="secondary"
            onPress={handleRefresh}
            loading={refreshing}
            testID="subscription-refresh"
          />
          {isBlocked ? (
            <>
              <View style={styles.spacer} />
              <Button
                title="Sign Out"
                variant="secondary"
                onPress={logout}
                testID="subscription-logout"
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      fontSize: fontSizes.md,
      color: colors.textSecondary,
    },
    content: {
      padding: spacing.base,
      paddingBottom: spacing.xl,
    },

    /* ── Cards ────────────────────────────────────────────────────── */
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.base,
      marginBottom: spacing.base,
      ...shadows.sm,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      color: colors.textDark,
      marginBottom: spacing.md,
    },

    /* ── Info rows ────────────────────────────────────────────────── */
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
    },
    infoRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    infoLabel: {
      fontSize: fontSizes.base,
      color: colors.textSecondary,
    },
    infoValue: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.semibold,
      color: colors.text,
    },

    /* ── Block reason ─────────────────────────────────────────────── */
    blockReasonBox: {
      backgroundColor: colors.dangerBg,
      borderRadius: radius.md,
      padding: spacing.sm,
      marginTop: spacing.md,
    },
    blockReasonText: {
      fontSize: fontSizes.sm,
      color: colors.dangerText,
      textAlign: 'center',
      lineHeight: 18,
    },

    /* ── Upgrade banner ───────────────────────────────────────────── */
    upgradeBanner: {
      backgroundColor: colors.warningBg,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      padding: spacing.base,
      marginBottom: spacing.base,
    },
    upgradeBannerTitle: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.bold,
      color: colors.warningText,
      marginBottom: spacing.xs,
    },
    upgradeBannerText: {
      fontSize: fontSizes.sm,
      color: colors.warningText,
      lineHeight: 20,
    },
    upgradeBannerBold: {
      fontWeight: fontWeights.bold,
    },

    /* ── Tier rows ────────────────────────────────────────────────── */
    tierRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    tierRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tierRowHighlight: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.md,
      marginHorizontal: -spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    tierLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    tierRange: {
      fontSize: fontSizes.base,
      color: colors.text,
    },
    tierRangeHighlight: {
      fontWeight: fontWeights.semibold,
      color: colors.textDark,
    },
    tierPrice: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.bold,
      color: colors.text,
    },
    tierPriceHighlight: {
      color: colors.primary,
    },

    /* ── Footer actions ───────────────────────────────────────────── */
    actions: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.base,
    },
    spacer: {
      height: spacing.md,
    },
  });
