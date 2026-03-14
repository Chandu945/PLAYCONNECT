import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { ChildSummary, PaymentHistoryItem } from '../../../domain/parent/parent.types';
import { getMyChildrenUseCase } from '../../../application/parent/use-cases/get-my-children.usecase';
import { getPaymentHistoryUseCase } from '../../../application/parent/use-cases/get-payment-history.usecase';
import { parentApi } from '../../../infra/parent/parent-api';
import { useAuth } from '../../context/AuthContext';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { spacing, fontSizes, fontWeights, radius, shadows, avatarColors } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { getGreeting, getInitials, formatCurrency, formatMonthShort, formatDate } from '../../utils/format';

type DashboardData = {
  children: ChildSummary[];
  payments: PaymentHistoryItem[];
};

function getAvatarColor(index: number, isDark: boolean): string {
  const palette = isDark ? avatarColors.dark : avatarColors.light;
  return palette[index % palette.length]!;
}

export function ParentDashboardScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [data, setData] = useState<DashboardData>({ children: [], payments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    const [childrenRes, paymentsRes] = await Promise.all([
      getMyChildrenUseCase({ parentApi }),
      getPaymentHistoryUseCase({ parentApi }),
    ]);
    if (!mountedRef.current) return;

    if (childrenRes.ok) {
      setData((prev) => ({
        ...prev,
        children: childrenRes.value,
        payments: paymentsRes.ok ? paymentsRes.value : prev.payments,
      }));
    } else {
      setError(childrenRes.error.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);

  const { children, payments } = data;

  const avgAttendance = children.length > 0
    ? Math.round(
        children.reduce((sum, c) => sum + (c.currentMonthAttendancePercent ?? 0), 0) /
        children.filter((c) => c.currentMonthAttendancePercent != null).length || 0,
      )
    : null;

  const totalMonthlyFee = children.reduce((sum, c) => sum + c.monthlyFee, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const recentPayments = payments.slice(0, 3);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
      showsVerticalScrollIndicator={false}
      testID="parent-dashboard-scroll"
    >
      {/* ── Greeting ── */}
      <View style={styles.greetingRow}>
        <View>
          <Text style={styles.greetingText}>{getGreeting()},</Text>
          <Text style={styles.greetingName}>{user?.fullName ?? 'Parent'}</Text>
        </View>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate('More', { screen: 'ParentProfile' })}
          activeOpacity={0.7}
        >
          {user?.profilePhotoUrl ? (
            <Image source={{ uri: user.profilePhotoUrl }} style={styles.profileImage} />
          ) : (
            // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
            <Icon name="account-circle-outline" size={28} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {error && <InlineError message={error} onRetry={load} />}

      {loading && !refreshing ? (
        <View testID="parent-skeleton">
          <View style={styles.skeletonRow}>
            <SkeletonTile />
            <SkeletonTile />
            <SkeletonTile />
          </View>
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : (
        <View testID="parent-dashboard-content">
          {/* ── Quick Stats ── */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('Children')}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconCircle, { backgroundColor: colors.primarySoft }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="account-child" size={20} color={colors.primary} />
              </View>
              <Text style={styles.statValue}>{children.length}</Text>
              <Text style={styles.statLabel}>Children</Text>
            </TouchableOpacity>

            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: '#ecfdf5' }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="calendar-check-outline" size={20} color={colors.success} />
              </View>
              <Text style={styles.statValue}>
                {avgAttendance != null ? `${avgAttendance}%` : '--'}
              </Text>
              <Text style={styles.statLabel}>Attendance</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: '#f0f0ff' }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="currency-inr" size={20} color="#6366f1" />
              </View>
              <Text style={styles.statValue}>{formatCurrency(totalMonthlyFee)}</Text>
              <Text style={styles.statLabel}>Monthly Fee</Text>
            </View>
          </View>

          {/* ── Quick Actions ── */}
          <View style={styles.quickActionsCard}>
            <Text style={styles.sectionLabel}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Children')}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: colors.primarySoft }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="account-child" size={20} color={colors.primary} />
                </View>
                <Text style={styles.quickActionLabel}>My{'\n'}Children</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Payments')}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#ecfdf5' }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="credit-card-outline" size={20} color={colors.success} />
                </View>
                <Text style={styles.quickActionLabel}>Payment{'\n'}History</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('More', { screen: 'AcademyInfo' })}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#f0f0ff' }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="school-outline" size={20} color="#6366f1" />
                </View>
                <Text style={styles.quickActionLabel}>Academy{'\n'}Info</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('More', { screen: 'ParentProfile' })}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#fef3e7' }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="account-edit-outline" size={20} color="#e67e22" />
                </View>
                <Text style={styles.quickActionLabel}>My{'\n'}Profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── My Children ── */}
          {children.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionHeaderIcon, { backgroundColor: colors.primarySoft }]}>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name="account-child" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.sectionTitle}>My Children</Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Children')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.viewAllLink}>View All</Text>
                </TouchableOpacity>
              </View>

              {children.map((child, index) => {
                const attendPct = child.currentMonthAttendancePercent;
                const attendColor =
                  attendPct == null
                    ? colors.textDisabled
                    : attendPct >= 75
                      ? colors.success
                      : attendPct >= 50
                        ? colors.warning
                        : colors.danger;

                return (
                  <TouchableOpacity
                    key={child.studentId}
                    style={styles.childRow}
                    activeOpacity={0.7}
                    onPress={() =>
                      navigation.navigate('Children', {
                        screen: 'ChildDetail',
                        params: { studentId: child.studentId, fullName: child.fullName },
                      })
                    }
                  >
                    <View style={[styles.childAvatar, { backgroundColor: getAvatarColor(index, isDark) }]}>
                      <Text style={styles.childAvatarText}>{getInitials(child.fullName)}</Text>
                    </View>
                    <View style={styles.childInfo}>
                      <View style={styles.childNameRow}>
                        <Text style={styles.childName} numberOfLines={1}>{child.fullName}</Text>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: child.status === 'ACTIVE' ? colors.success : colors.textDisabled },
                          ]}
                        />
                      </View>
                      <Text style={styles.childFee}>
                        {formatCurrency(child.monthlyFee)}
                        <Text style={styles.childFeeLabel}> / month</Text>
                      </Text>
                    </View>
                    <View style={styles.childAttendance}>
                      <Text style={[styles.childAttendanceValue, { color: attendColor }]}>
                        {attendPct != null ? `${attendPct}%` : '--'}
                      </Text>
                      <Text style={styles.childAttendanceLabel}>Attendance</Text>
                    </View>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name="chevron-right" size={18} color={colors.textDisabled} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Payment Summary ── */}
          {payments.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionHeaderIcon, { backgroundColor: '#ecfdf5' }]}>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name="credit-card-check-outline" size={18} color={colors.success} />
                  </View>
                  <Text style={styles.sectionTitle}>Recent Payments</Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Payments')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.viewAllLink}>View All</Text>
                </TouchableOpacity>
              </View>

              {/* Total paid summary */}
              <View style={styles.totalPaidBanner}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="check-decagram" size={20} color={colors.success} />
                <View style={styles.totalPaidInfo}>
                  <Text style={styles.totalPaidLabel}>Total Paid</Text>
                  <Text style={styles.totalPaidValue}>{formatCurrency(totalPaid)}</Text>
                </View>
                <View style={styles.totalPaidCount}>
                  <Text style={styles.totalPaidCountValue}>{payments.length}</Text>
                  <Text style={styles.totalPaidCountLabel}>payments</Text>
                </View>
              </View>

              {/* Recent items */}
              {recentPayments.map((payment) => (
                <TouchableOpacity
                  key={payment.receiptNumber}
                  style={styles.paymentRow}
                  activeOpacity={0.7}
                  onPress={() =>
                    navigation.navigate('Payments', {
                      screen: 'Receipt',
                      params: { feeDueId: payment.feeDueId },
                    })
                  }
                >
                  <View style={styles.paymentAvatar}>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name="receipt" size={16} color={colors.success} />
                  </View>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentName} numberOfLines={1}>
                      {payment.studentName}
                    </Text>
                    <Text style={styles.paymentMeta}>
                      {formatMonthShort(payment.monthKey)} · {formatDate(payment.paidAt)}
                    </Text>
                  </View>
                  <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Academy Info Card ── */}
          <TouchableOpacity
            style={styles.academyCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('More', { screen: 'AcademyInfo' })}
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionHeaderIcon, { backgroundColor: '#f0f0ff' }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="school-outline" size={18} color="#6366f1" />
              </View>
              <View>
                <Text style={styles.sectionTitle}>Academy Information</Text>
                <Text style={styles.academySubtitle}>View academy details and contact info</Text>
              </View>
            </View>
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
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

  /* ── Greeting ───────────────────────────────────── */
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greetingText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  greetingName: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginTop: 2,
  },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  /* ── Stats ──────────────────────────────────────── */
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },

  /* ── Quick Actions ──────────────────────────────── */
  quickActionsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  sectionLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickAction: {
    alignItems: 'center',
    flex: 1,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  quickActionLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },

  /* ── Section Card ───────────────────────────────── */
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  sectionHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  viewAllLink: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },

  /* ── Children Rows ──────────────────────────────── */
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  childAvatarText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  childInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  childNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  childName: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flex: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: spacing.xs,
  },
  childFee: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  childFeeLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.normal,
    color: colors.textDisabled,
  },
  childAttendance: {
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  childAttendanceValue: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  childAttendanceLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
  },

  /* ── Payment Summary ────────────────────────────── */
  totalPaidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  totalPaidInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  totalPaidLabel: {
    fontSize: fontSizes.xs,
    color: colors.successText,
  },
  totalPaidValue: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.successText,
  },
  totalPaidCount: {
    alignItems: 'center',
  },
  totalPaidCountValue: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.successText,
  },
  totalPaidCountLabel: {
    fontSize: fontSizes.xs,
    color: colors.successText,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paymentAvatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentName: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  paymentMeta: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  paymentAmount: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },

  /* ── Academy Card ───────────────────────────────── */
  academyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  academySubtitle: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
