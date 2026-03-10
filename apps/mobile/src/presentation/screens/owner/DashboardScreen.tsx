import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useOwnerDashboard } from '../../../application/dashboard/use-owner-dashboard';
import { getOwnerDashboard } from '../../../infra/dashboard/dashboard-api';
import { useFAB } from '../../context/FABContext';
import { FinancialOverviewWidget } from '../../components/dashboard/FinancialOverviewWidget';
import { AttendanceSummaryWidget } from '../../components/dashboard/AttendanceSummaryWidget';
import { AttendanceMarkingCards } from '../../components/dashboard/AttendanceMarkingCards';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { BirthdayWidget } from '../../components/dashboard/BirthdayWidget';
import { MonthlyChartWidget } from '../../components/dashboard/MonthlyChartWidget';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

const DEFAULT_RANGE = { mode: 'preset' as const, preset: 'THIS_MONTH' as const };
const dashboardApi = { getOwnerDashboard };

export function DashboardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, loading, error, refetch } = useOwnerDashboard(DEFAULT_RANGE, dashboardApi);
  const { showFAB, hideFAB } = useFAB();

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      showFAB();
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
      } else {
        refetch();
      }
      return () => hideFAB();
    }, [showFAB, hideFAB, refetch]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
      testID="dashboard-scroll"
    >
      {error && <InlineError message={error.message} onRetry={refetch} />}

      {loading && !refreshing ? (
        <View testID="skeleton-container">
          <View style={styles.row}>
            <SkeletonTile />
            <SkeletonTile />
          </View>
          <View style={styles.row}>
            <SkeletonTile />
            <SkeletonTile />
          </View>
        </View>
      ) : data ? (
        <View testID="kpi-container">
          {/* ── Students Overview ─────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="school-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Students Overview</Text>
            </View>
            <View style={styles.overviewGrid}>
              <View style={styles.overviewItem}>
                <Text style={styles.overviewValue}>{data.totalActiveStudents}</Text>
                <Text style={styles.overviewLabel}>Active</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewItem}>
                <Text style={styles.overviewValue}>{data.newAdmissions}</Text>
                <Text style={styles.overviewLabel}>New</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewItem}>
                <Text style={styles.overviewValue}>{data.inactiveStudents}</Text>
                <Text style={styles.overviewLabel}>Inactive</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewItem}>
                <Text style={styles.overviewValue}>{data.dueStudentsCount}</Text>
                <Text style={styles.overviewLabel}>Due</Text>
              </View>
            </View>
          </View>

          {/* ── Pending Requests ──────────────────────────── */}
          {data.pendingPaymentRequests > 0 && (
            <View style={styles.pendingBanner}>
              <View style={styles.pendingLeft}>
                <View style={styles.cardHeaderIcon}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="file-document-outline" size={18} color={colors.primary} />
                </View>
                <Text style={styles.pendingText}>Pending Requests</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{data.pendingPaymentRequests}</Text>
              </View>
            </View>
          )}

          <FinancialOverviewWidget />
          <AttendanceSummaryWidget />
          <AttendanceMarkingCards />
          <MonthlyChartWidget />
          <BirthdayWidget />
        </View>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },

  /* ── Cards ───────────────────────────────────────── */
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },

  /* ── Students Overview Grid ──────────────────────── */
  overviewGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  overviewDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  overviewValue: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  overviewLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* ── Pending Banner ──────────────────────────────── */
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pendingText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  pendingBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pendingBadgeText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
});
