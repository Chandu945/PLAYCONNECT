import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ParentHomeStackParamList } from '../../navigation/ParentHomeStack';
import type { ChildAttendanceSummary, ChildFeeDue } from '../../../domain/parent/parent.types';
import { getChildAttendanceUseCase } from '../../../application/parent/use-cases/get-child-attendance.usecase';
import { getChildFeesUseCase } from '../../../application/parent/use-cases/get-child-fees.usecase';
import { parentApi } from '../../../infra/parent/parent-api';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { formatMonthKey, formatMonthShort, formatCurrency } from '../../utils/format';
import { useTheme } from '../../context/ThemeContext';
import { getCurrentMonthIST, nowIST } from '../../../domain/common/date-utils';

type Route = RouteProp<ParentHomeStackParamList, 'ChildDetail'>;
type Nav = NativeStackNavigationProp<ParentHomeStackParamList, 'ChildDetail'>;

function getCurrentMonth(): string {
  return getCurrentMonthIST();
}

function getMonthRange(): { from: string; to: string } {
  const d = nowIST();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const fromMonth = m - 5;
  const toMonth = m + 1;
  const fromYear = fromMonth <= 0 ? y - 1 : y;
  const fromM = fromMonth <= 0 ? fromMonth + 12 : fromMonth;
  const toYear = toMonth > 12 ? y + 1 : y;
  const toM = toMonth > 12 ? toMonth - 12 : toMonth;
  return {
    from: `${fromYear}-${String(fromM).padStart(2, '0')}`,
    to: `${toYear}-${String(toM).padStart(2, '0')}`,
  };
}

function AttendanceBar({
  label,
  count,
  total,
  color,
  icon,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bStyles = useMemo(() => makeBarStyles(colors), [colors]);
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={bStyles.row}>
      <View style={bStyles.labelRow}>
        {/* @ts-expect-error react-native-vector-icons types */}
        <Icon name={icon} size={16} color={color} />
        <Text style={bStyles.label}>{label}</Text>
      </View>
      <View style={bStyles.barOuter}>
        <View style={[bStyles.barInner, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[bStyles.count, { color }]}>{count}</Text>
    </View>
  );
}

const makeBarStyles = (colors: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 90,
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  barOuter: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  barInner: {
    height: 8,
    borderRadius: 4,
  },
  count: {
    width: 28,
    textAlign: 'right',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});

function FeeStatusIcon({ status }: { status: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (status === 'PAID') {
    // @ts-expect-error react-native-vector-icons types
    return <Icon name="check-circle" size={20} color={colors.success} />;
  }
  if (status === 'DUE') {
    // @ts-expect-error react-native-vector-icons types
    return <Icon name="alert-circle" size={20} color={colors.danger} />;
  }
  // @ts-expect-error react-native-vector-icons types
  return <Icon name="clock-outline" size={20} color={colors.textDisabled} />;
}

export function ChildDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const studentId = route.params?.studentId ?? '';

  const [attendance, setAttendance] = useState<ChildAttendanceSummary | null>(null);
  const [fees, setFees] = useState<ChildFeeDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const month = getCurrentMonth();
    const { from, to } = getMonthRange();

    const [attResult, feesResult] = await Promise.all([
      getChildAttendanceUseCase({ parentApi }, studentId, month),
      getChildFeesUseCase({ parentApi }, studentId, from, to),
    ]);

    if (!mountedRef.current) return;

    if (attResult.ok) setAttendance(attResult.value);
    if (feesResult.ok) setFees(feesResult.value);
    if (!attResult.ok && !feesResult.ok) {
      setError('Failed to load details. Pull down to retry.');
    }
    setLoading(false);
    setRefreshing(false);
  }, [studentId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  const totalDays =
    attendance
      ? attendance.presentCount + attendance.absentCount + attendance.holidayCount
      : 0;
  const attendancePct =
    totalDays > 0
      ? Math.round((attendance!.presentCount / ((totalDays - attendance!.holidayCount) || 1)) * 100)
      : 0;

  const totalDue = fees
    .filter((f) => f.status === 'DUE')
    .reduce((sum, f) => sum + f.amount + f.lateFee, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
    >
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
          <Text style={styles.statValue}>{attendancePct}%</Text>
          <Text style={styles.statLabel}>Attendance</Text>
        </View>
        <View
          style={[
            styles.statCard,
            { borderLeftColor: totalDue > 0 ? colors.danger : colors.success },
          ]}
        >
          <Text style={styles.statValue}>{formatCurrency(totalDue)}</Text>
          <Text style={styles.statLabel}>{totalDue > 0 ? 'Due' : 'All Clear'}</Text>
        </View>
      </View>

      {/* Attendance Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="calendar-check-outline" size={20} color={colors.primary} />
          <Text style={styles.sectionTitle}>
            Attendance — {formatMonthKey(getCurrentMonth())}
          </Text>
        </View>
        {attendance && (
          <View style={styles.sectionCard}>
            <AttendanceBar
              label="Present"
              count={attendance.presentCount}
              total={totalDays}
              color={colors.success}
              icon="check-circle-outline"
            />
            <AttendanceBar
              label="Absent"
              count={attendance.absentCount}
              total={totalDays}
              color={colors.danger}
              icon="close-circle-outline"
            />
            <AttendanceBar
              label="Holidays"
              count={attendance.holidayCount}
              total={totalDays}
              color={colors.textDisabled}
              icon="calendar-remove-outline"
            />
          </View>
        )}
        {!attendance && (
          <View style={styles.sectionCard}>
            <Text style={styles.noData}>No attendance data available</Text>
          </View>
        )}
      </View>

      {/* Fee History Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="receipt" size={20} color={colors.primary} />
          <Text style={styles.sectionTitle}>Fee History</Text>
        </View>
        {fees.map((fee) => (
          <View key={fee.id} style={styles.feeCard}>
            <View style={styles.feeRow}>
              <FeeStatusIcon status={fee.status} />
              <View style={styles.feeInfo}>
                <Text style={styles.feeMonth}>{formatMonthShort(fee.monthKey)}</Text>
                <View style={styles.feeStatusRow}>
                  <View
                    style={[
                      styles.feeBadge,
                      {
                        backgroundColor:
                          fee.status === 'PAID'
                            ? colors.successBg
                            : fee.status === 'DUE'
                              ? colors.dangerBg
                              : colors.bgSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.feeBadgeText,
                        {
                          color:
                            fee.status === 'PAID'
                              ? colors.successText
                              : fee.status === 'DUE'
                                ? colors.dangerText
                                : colors.textSecondary,
                        },
                      ]}
                    >
                      {fee.status}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={styles.feeAmount}>
                {formatCurrency(fee.status === 'DUE' && fee.lateFee > 0 ? fee.amount + fee.lateFee : fee.amount)}
              </Text>
            </View>
            {fee.status === 'PAID' && (
              <TouchableOpacity
                style={styles.receiptButton}
                onPress={() => navigation.navigate('Receipt', { feeDueId: fee.id })}
              >
                {/* @ts-expect-error react-native-vector-icons types */}
                <Icon name="file-document-outline" size={16} color={colors.successText} />
                <Text style={styles.receiptButtonText}>View Receipt</Text>
              </TouchableOpacity>
            )}
            {fee.status === 'DUE' && fee.lateFee > 0 && (
              <View style={styles.lateFeeNotice}>
                {/* @ts-expect-error react-native-vector-icons types */}
                <Icon name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={styles.lateFeeNoticeText}>
                  Late fee of {formatCurrency(fee.lateFee)} applied
                </Text>
              </View>
            )}
            {fee.status === 'DUE' && fee.lateFee === 0 && (() => {
              const dueDateMs = new Date(fee.dueDate + 'T00:00:00').getTime();
              const todayMs = nowIST().setHours(0, 0, 0, 0);
              const dayMs = 24 * 60 * 60 * 1000;
              const daysPastDue = Math.floor((todayMs - dueDateMs) / dayMs);
              return daysPastDue > 0 ? (
                <View style={styles.graceNotice}>
                  {/* @ts-expect-error react-native-vector-icons types */}
                  <Icon name="clock-alert-outline" size={14} color={colors.warning} />
                  <Text style={styles.graceNoticeText}>
                    Pay soon to avoid late fees
                  </Text>
                </View>
              ) : null;
            })()}
            {fee.status === 'DUE' && (
              <TouchableOpacity
                style={styles.payButton}
                onPress={() =>
                  navigation.navigate('FeePayment', {
                    feeDueId: fee.id,
                    monthKey: fee.monthKey,
                    amount: fee.amount,
                    lateFee: fee.lateFee,
                  })
                }
              >
                {/* @ts-expect-error react-native-vector-icons types */}
                <Icon name="credit-card-outline" size={16} color={colors.white} />
                <Text style={styles.payButtonText}>
                  {fee.lateFee > 0
                    ? `Pay ${formatCurrency(fee.amount + fee.lateFee)}`
                    : 'Pay Now'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {fees.length === 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.noData}>No fee records found</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBanner: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { fontSize: fontSizes.base, color: colors.dangerText },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderLeftWidth: 4,
    ...shadows.sm,
  },
  statValue: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    ...shadows.sm,
  },
  noData: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  feeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feeInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  feeMonth: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  feeStatusRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  feeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  feeBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  feeAmount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
  },
  receiptButtonText: {
    color: colors.successText,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.sm,
  },
  lateFeeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
  },
  lateFeeNoticeText: {
    fontSize: fontSizes.xs,
    color: colors.danger,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  graceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
  },
  graceNoticeText: {
    fontSize: fontSizes.xs,
    color: colors.warning,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  payButtonText: {
    color: colors.white,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.sm,
  },
});
