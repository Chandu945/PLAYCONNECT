import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import { CardHeader } from '../ui/CardHeader';
import LinearGradient from 'react-native-linear-gradient';
import { getOwnerDashboard } from '../../../infra/dashboard/dashboard-api';
import { spacing, fontSizes, fontWeights, radius, gradient } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

function getMonthLabel(year: number, month: number): string {
  const d = new Date(year, month - 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function formatCurrency(n: number): string {
  if (n < 0) return `-\u20B9${Math.abs(n).toLocaleString('en-IN')}`;
  return `\u20B9${n.toLocaleString('en-IN')}`;
}

type FinancialData = {
  collected: number;
  pending: number;
  expenses: number;
  lateFees: number;
};

type MetricTone = 'success' | 'warning' | 'danger' | 'info';

type ToneStyle = { bg: string; border: string; tint: string; fg: string };

function getToneStyles(tone: MetricTone, colors: Colors): ToneStyle {
  switch (tone) {
    case 'success':
      return { bg: colors.successBg, border: colors.successBorder, tint: colors.success, fg: colors.successText };
    case 'warning':
      return { bg: colors.warningBg, border: colors.warningBorder, tint: colors.warning, fg: colors.warningText };
    case 'danger':
      return { bg: colors.dangerBg, border: colors.dangerBorder, tint: colors.danger, fg: colors.dangerText };
    case 'info':
    default:
      return { bg: colors.infoBg, border: 'rgba(6,182,212,0.32)', tint: colors.info, fg: colors.infoText };
  }
}

function MetricTile({
  icon,
  label,
  amount,
  maxAmount,
  tone,
  onPress,
}: {
  icon: string;
  label: string;
  amount: number;
  maxAmount: number;
  tone: MetricTone;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const t = useMemo(() => getToneStyles(tone, colors), [tone, colors]);
  const pct = maxAmount > 0 ? Math.round((amount / maxAmount) * 100) : 0;

  return (
    <TouchableOpacity
      style={styles.metricTile}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.metricIconCircle, { backgroundColor: t.bg, borderColor: t.border }]}>
        <AppIcon name={icon} size={16} color={t.fg} />
      </View>
      <Text style={styles.metricAmount} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(amount)}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricBar}>
        <View
          style={[
            styles.metricBarFill,
            { width: `${pct}%` as any, backgroundColor: t.tint },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

type FinancialOverviewWidgetProps = {
  onCollectedPress?: () => void;
  onPendingPress?: () => void;
  onExpensesPress?: () => void;
  onLateFeesPress?: () => void;
  initialData?: { collected: number; pending: number; expenses: number; lateFees: number } | null;
};

export function FinancialOverviewWidget({ onCollectedPress, onPendingPress, onExpensesPress, onLateFeesPress, initialData }: FinancialOverviewWidgetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [initDate] = useState(() => new Date());
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth() + 1);
  const [data, setData] = useState<FinancialData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const mountedRef = useRef(true);

  // Reflect the dashboard's (refreshable) initialData whenever it changes while
  // we're on the current month. Previously a one-shot `initialUsedRef` latch
  // applied it only on first load, so pull-to-refresh's updated numbers were
  // ignored and the card froze on its first-load values until remount.
  const initialUsedRef = useRef(false);
  useEffect(() => {
    if (!initialData) return;
    const isCurrent = year === initDate.getFullYear() && month === initDate.getMonth() + 1;
    if (!isCurrent) return;
    // The current month is served by the parent's initialData — mark so load()
    // skips its redundant self-fetch.
    initialUsedRef.current = true;
    setLoading(false);
    // Only replace state when the figures actually changed, so unrelated parent
    // re-renders don't churn this card.
    setData((prev) =>
      prev &&
      prev.collected === initialData.collected &&
      prev.pending === initialData.pending &&
      prev.expenses === initialData.expenses &&
      prev.lateFees === initialData.lateFees
        ? prev
        : initialData,
    );
  }, [initialData, year, month, initDate]);

  const load = useCallback(async () => {
    // Skip fetch for current month if initialData was used
    const isCurrent = year === new Date().getFullYear() && month === new Date().getMonth() + 1;
    if (isCurrent && initialUsedRef.current) {
      return;
    }

    setLoading(true);
    const { from, to } = getMonthRange(year, month);
    const result = await getOwnerDashboard({ mode: 'custom', from, to });
    if (!mountedRef.current) return;
    if (result.ok) {
      setData({
        collected: result.value.totalCollected,
        pending: result.value.totalPendingAmount,
        expenses: result.value.totalExpenses,
        lateFees: result.value.lateFeeCollected,
      });
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const goBack = () => {
    initialUsedRef.current = false;
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goForward = () => {
    const n = new Date();
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    if (
      nextYear > n.getFullYear() ||
      (nextYear === n.getFullYear() && nextMonth > n.getMonth() + 1)
    ) {
      return;
    }
    initialUsedRef.current = false;
    setYear(nextYear);
    setMonth(nextMonth);
  };

  const netProfit = data ? data.collected - data.expenses : 0;
  const maxAmount = data
    ? Math.max(data.collected, data.pending, data.expenses, data.lateFees, 1)
    : 1;
  const profitPct =
    data && data.collected > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((data.collected - data.expenses) / data.collected) * 100,
            ),
          ),
        )
      : 0;

  return (
    <View style={styles.container} testID="financial-overview-widget">
      <CardHeader
        icon={<AppIcon name="currency-inr" size={18} color={colors.success} />}
        iconTint="success"
        title="Financial Overview"
        action={
          <View style={styles.monthNav}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.navBtn}
              accessibilityLabel="Previous month"
              accessibilityRole="button"
              testID="financial-month-back"
            >
              <AppIcon name="chevron-left" size={20} color={colors.textLight} />
            </TouchableOpacity>
            <Text
              style={styles.monthLabel}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {getMonthLabel(year, month)}
            </Text>
            <TouchableOpacity
              onPress={goForward}
              style={styles.navBtn}
              accessibilityLabel="Next month"
              accessibilityRole="button"
              testID="financial-month-forward"
            >
              <AppIcon name="chevron-right" size={20} color={colors.textLight} />
            </TouchableOpacity>
          </View>
        }
      />

      {loading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : data ? (
        <>
          {/* Net Profit highlight */}
          <View style={styles.profitCard}>
            <View style={styles.profitHeader}>
              <Text style={styles.profitLabel}>{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</Text>
              <View style={[styles.profitIconCircle, { backgroundColor: netProfit >= 0 ? colors.successBg : colors.dangerBg }]}>
                <AppIcon
                  name={netProfit >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={netProfit >= 0 ? colors.success : colors.danger}
                />
              </View>
            </View>
            <Text style={[styles.profitValue, { color: netProfit >= 0 ? colors.success : colors.danger }]}>{formatCurrency(netProfit)}</Text>
            <View style={styles.profitBar}>
              <View
                style={[
                  styles.profitBarFill,
                  { width: `${profitPct}%` as any },
                ]}
              >
                <LinearGradient
                  colors={[gradient.start, gradient.end]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </View>
          </View>

          {/* Metric tiles */}
          <View style={styles.metricsRow}>
            <MetricTile
              icon="cash-check"
              label="Collected"
              amount={data.collected}
              maxAmount={maxAmount}
              tone="success"
              onPress={onCollectedPress}
            />
            <MetricTile
              icon="clock-outline"
              label="Pending"
              amount={data.pending}
              maxAmount={maxAmount}
              tone="warning"
              onPress={onPendingPress}
            />
            <MetricTile
              icon="cash-minus"
              label="Expenses"
              amount={data.expenses}
              maxAmount={maxAmount}
              tone="danger"
              onPress={onExpensesPress}
            />
            <MetricTile
              icon="clock-alert-outline"
              label="Late Fees"
              amount={data.lateFees}
              maxAmount={maxAmount}
              tone="info"
              onPress={onLateFeesPress}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginHorizontal: spacing.md,
    letterSpacing: 0.2,
  },
  placeholder: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Net Profit */
  profitCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  profitLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  profitIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profitValue: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  profitBar: {
    height: 6,
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  profitBarFill: {
    height: '100%',
    overflow: 'hidden',
    borderRadius: radius.full,
  },

  /* Metric tiles */
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricTile: {
    width: '48%' as any,
    flexGrow: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  metricIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricAmount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricBar: {
    width: '100%',
    height: 5,
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
});
