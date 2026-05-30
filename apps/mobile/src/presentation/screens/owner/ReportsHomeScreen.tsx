import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  FlatList,
  Text,
  ActivityIndicator,
  StyleSheet} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/ui/AppIcon';
import { useReports } from '../../../application/reports/use-reports';
import { usePendingDues } from '../../../application/reports/use-pending-dues';
import {
  getMonthlyRevenue,
  getStudentWiseDues,
  getRevenueExportUrl,
  getPendingDuesExportUrl,
} from '../../../infra/reports/reports-api';
import { pdfDownload } from '../../../infra/reports/pdf-download';
import { exportRevenuePdfUseCase } from '../../../application/reports/use-cases/export-revenue-pdf.usecase';
import { exportPendingDuesPdfUseCase } from '../../../application/reports/use-cases/export-pending-dues-pdf.usecase';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { MonthPickerRow } from '../../components/fees/MonthPickerRow';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { ExportButton } from '../../components/reports/ExportButton';
import type { StudentWiseDueItem } from '../../../domain/reports/reports.types';
import LinearGradient from 'react-native-linear-gradient';
import { spacing, fontSizes, fontWeights, radius, shadows, listDefaults, avatarColors, gradient } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { getCurrentMonthIST } from '../../../domain/common/date-utils';
import { formatCurrency } from '../../utils/format';

const revenueApiRef = { getMonthlyRevenue };
const duesApiRef = { getStudentWiseDues };

function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'STAFF_APPROVED': return 'Staff Collection';
    case 'MANUAL': return 'Manual Entry';
    default: return source.replace(/_/g, ' ');
  }
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'STAFF_APPROVED': return 'account-check-outline';
    case 'MANUAL': return 'pencil-outline';
    default: return 'cash';
  }
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function getAvatarColor(name: string, isDark: boolean): string {
  const pool = isDark ? avatarColors.dark : avatarColors.light;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return pool[Math.abs(hash) % pool.length]!;
}

const SEGMENTS = ['Revenue', 'Pending Dues'];

export function ReportsHomeScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { month, setMonth, revenue, loading, error, refetch } =
    useReports(revenueApiRef);
  const {
    items: pendingDues,
    loading: duesLoading,
    loadingMore: duesLoadingMore,
    total: duesTotal,
    error: duesError,
    hasMore: duesHasMore,
    refetch: refetchDues,
    fetchMore: fetchMoreDues,
  } = usePendingDues(duesApiRef, month);
  const [selectedSegment, setSelectedSegment] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const goToPrev = useCallback(() => {
    setMonth(addMonths(month, -1));
  }, [month, setMonth]);

  const goToNext = useCallback(() => {
    setMonth(addMonths(month, 1));
  }, [month, setMonth]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchDues()]);
    } catch {
      // Handled by hooks
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchDues]);

  const handleExportRevenue = useCallback(() => {
    return exportRevenuePdfUseCase(
      { pdfDownload, getExportUrl: getRevenueExportUrl },
      month,
    );
  }, [month]);

  const handleExportDues = useCallback(() => {
    return exportPendingDuesPdfUseCase(
      { pdfDownload, getExportUrl: getPendingDuesExportUrl },
      month,
    );
  }, [month]);

  const dueKeyExtractor = useCallback((item: StudentWiseDueItem) => `${item.studentId}-${item.monthKey}`, []);

  const renderDueItem = useCallback(
    ({ item }: { item: StudentWiseDueItem }) => {
      const avatarBg = getAvatarColor(item.studentName, isDark);
      return (
        <View style={styles.dueRow} testID={`due-row-${item.studentId}`}>
          <View style={[styles.avatar, { backgroundColor: avatarBg + '20' }]}>
            <Text style={[styles.avatarText, { color: avatarBg }]}>
              {getInitial(item.studentName)}
            </Text>
          </View>
          <View style={styles.dueInfo}>
            <Text style={styles.dueName} numberOfLines={1}>
              {item.studentName}
            </Text>
            <View style={styles.dueMetaRow}>
              
              <AppIcon name="clock-alert-outline" size={12} color={colors.warning} />
              <Text style={styles.duePending}>
                {item.pendingMonthsCount} month{item.pendingMonthsCount !== 1 ? 's' : ''} pending
              </Text>
            </View>
          </View>
          <View style={styles.dueAmounts}>
            <Text style={styles.dueAmount}>{formatCurrency(item.amount + (item.lateFee ?? 0))}</Text>
            {(item.lateFee ?? 0) > 0 ? (
              <Text style={[styles.dueStatusText, { color: colors.warning }]}>
                incl. {formatCurrency(item.lateFee ?? 0)} late
              </Text>
            ) : (
              <View style={styles.dueStatusBadge}>
                <Text style={styles.dueStatusText}>{item.status}</Text>
              </View>
            )}
          </View>
        </View>
      );
    },
    [colors, isDark, styles],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <MonthPickerRow
          month={month}
          onPrevious={goToPrev}
          onNext={goToNext}
          disableNext={month >= getCurrentMonthIST()}
        />
        <SegmentedControl
          segments={SEGMENTS}
          selectedIndex={selectedSegment}
          onSelect={setSelectedSegment}
          testID="reports-segments"
        />
      </View>

      {error && <InlineError message={error.message} onRetry={refetch} />}
      {duesError && !error && <InlineError message={duesError.message} onRetry={refetchDues} />}

      {loading && !refreshing ? (
        <View style={styles.skeletonContainer} testID="skeleton-container">
          <View style={styles.kpiRow}>
            <SkeletonTile />
            <SkeletonTile />
          </View>
          <View style={styles.kpiRow}>
            <SkeletonTile />
          </View>
        </View>
      ) : selectedSegment === 0 ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          testID="revenue-scroll"
        >
          {revenue ? (
            <View testID="revenue-container">
              {/* ── KPI Tiles ──────────────────────────── */}
              <View style={styles.kpiRow}>
                <View style={styles.kpiTile}>
                  <View style={[styles.kpiIconCircle, { overflow: 'hidden' }]}>
                    <LinearGradient
                      colors={[gradient.start, gradient.end]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <AppIcon name="cash-multiple" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={styles.kpiValue}>{formatCurrency(revenue.totalAmount)}</Text>
                  <Text style={styles.kpiLabel}>Total Revenue</Text>
                </View>
                <View style={styles.kpiTile}>
                  <View style={[styles.kpiIconCircle, { backgroundColor: colors.infoBg }]}>
                    
                    <AppIcon name="receipt" size={20} color={colors.info} />
                  </View>
                  <Text style={styles.kpiValue}>{revenue.transactionCount}</Text>
                  <Text style={styles.kpiLabel}>Transactions</Text>
                </View>
              </View>

              {/* ── Cash-vs-Accrual Breakdown ─────────────
                  This is the bit that resolves the "why is May revenue higher
                  than May expected?" confusion: the picked-month total above
                  is cash-bucketed (when it hit the bank), and this card splits
                  that cash by which due-month each rupee was actually for. */}
              {revenue.byDueMonth && revenue.byDueMonth.length > 0 && (
                <View style={styles.breakdownCard} testID="revenue-breakdown">
                  <Text style={styles.breakdownTitle}>Of {formatCurrency(revenue.totalAmount)} collected:</Text>
                  {revenue.byDueMonth.map((b) => {
                    const isCurrent = b.monthKey === month;
                    return (
                      <View key={b.monthKey} style={styles.breakdownRow}>
                        <View style={styles.breakdownLabelWrap}>
                          <View
                            style={[
                              styles.breakdownDot,
                              { backgroundColor: isCurrent ? colors.success : colors.warning },
                            ]}
                          />
                          <Text style={styles.breakdownLabel}>
                            {(() => { const [y, m] = b.monthKey.split('-').map(Number) as [number, number]; return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); })()}
                            {isCurrent ? ' dues' : ' (back-dated)'}
                          </Text>
                        </View>
                        <Text style={styles.breakdownAmount}>{formatCurrency(b.amount)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* ── Transactions Header ────────────────── */}
              {revenue.transactions.length > 0 && (
                <View style={styles.listSectionHeader}>

                  <AppIcon name="format-list-bulleted" size={18} color={colors.textSecondary} />
                  <Text style={styles.listSectionTitle}>Transactions</Text>
                  <Text style={styles.listSectionCount}>{revenue.transactions.length}</Text>
                </View>
              )}

              {revenue.transactions.length === 0 ? (
                <EmptyState message="No transactions for this month" />
              ) : (
                revenue.transactions.map((tx) => (
                  <View key={tx.id} style={styles.txRow} testID={`tx-row-${tx.id}`}>
                    <View style={[styles.txIconCircle, { backgroundColor: colors.successBg }]}>
                      
                      <AppIcon name={getSourceIcon(tx.source)} size={18} color={colors.success} />
                    </View>
                    <View style={styles.txInfo}>
                      <Text style={styles.txReceipt}>{tx.receiptNumber}</Text>
                      <View style={styles.txSourceRow}>
                        <Text style={styles.txSource}>{getSourceLabel(tx.source)}</Text>
                      </View>
                    </View>
                    <Text style={styles.txAmount}>{formatCurrency(tx.amount)}</Text>
                  </View>
                ))
              )}

              <View style={styles.exportRow}>
                <ExportButton
                  onExport={handleExportRevenue}
                  testID="export-revenue-pdf"
                />
              </View>
            </View>
          ) : <EmptyState message="No revenue data for this month" />}
        </ScrollView>
      ) : (
        <View style={styles.duesContainer}>
          {duesLoading && !refreshing ? (
            <View style={styles.skeletonContainer}>
              <SkeletonTile />
              <SkeletonTile />
              <SkeletonTile />
            </View>
          ) : (
            <FlatList
              data={pendingDues}
              keyExtractor={dueKeyExtractor}
              renderItem={renderDueItem}
              onEndReached={fetchMoreDues}
              onEndReachedThreshold={0.3}
          removeClippedSubviews
          windowSize={11}
          maxToRenderPerBatch={5}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
              ListHeaderComponent={
                pendingDues.length > 0 ? (
                  <View style={styles.listSectionHeader}>
                    
                    <AppIcon name="account-alert-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.listSectionTitle}>Pending Dues</Text>
                    <Text style={styles.listSectionCount}>{duesTotal}</Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={<EmptyState message="No pending dues for this month" />}
              ListFooterComponent={
                duesLoadingMore ? (
                  <View style={styles.footer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : pendingDues.length > 0 && !duesHasMore ? (
                  <View style={styles.exportRow}>
                    <ExportButton
                      onExport={handleExportDues}
                      testID="export-dues-pdf"
                    />
                  </View>
                ) : null
              }
              testID="dues-list"
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  skeletonContainer: {
    padding: spacing.base,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },

  /* ── KPI Tiles ───────────────────────────────────── */
  kpiTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    ...shadows.sm,
  },
  kpiIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  kpiValue: {
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },

  /* ── Cash-vs-Accrual Breakdown ───────────────────── */
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakdownTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  breakdownLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    fontSize: fontSizes.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  breakdownAmount: {
    fontSize: fontSizes.sm,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },

  /* ── List Section Header ─────────────────────────── */
  listSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  listSectionTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flex: 1,
  },
  listSectionCount: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },

  /* ── Scroll / List Content ───────────────────────── */
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: listDefaults.contentPaddingBottomNoFab,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: listDefaults.contentPaddingBottomNoFab,
  },

  /* ── Transaction Row ─────────────────────────────── */
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  txIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
  },
  txReceipt: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  txSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  txSource: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  txAmount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.success,
  },

  /* ── Due Row ─────────────────────────────────────── */
  duesContainer: {
    flex: 1,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  dueInfo: {
    flex: 1,
  },
  dueName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: 4,
  },
  dueMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  duePending: {
    fontSize: fontSizes.xs,
    color: colors.warning,
    fontWeight: fontWeights.medium,
  },
  dueAmounts: {
    alignItems: 'flex-end',
  },
  dueAmount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.danger,
    marginBottom: 4,
  },
  dueStatusBadge: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  dueStatusText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.warningText,
    textTransform: 'uppercase',
  },

  /* ── Footer ────────────────────────────────────────── */
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },

  /* ── Export ───────────────────────────────────────── */
  exportRow: {
    paddingTop: spacing.sm,
  },
});
