import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/ui/AppIcon';
import { AvatarImage } from '../../components/ui/AvatarImage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { ChildSummary, PaymentHistoryItem } from '../../../domain/parent/parent.types';
import { getMyChildrenUseCase } from '../../../application/parent/use-cases/get-my-children.usecase';
import { getPaymentHistoryUseCase } from '../../../application/parent/use-cases/get-payment-history.usecase';
import { parentApi } from '../../../infra/parent/parent-api';
import { useAuth } from '../../context/AuthContext';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import LinearGradient from 'react-native-linear-gradient';
import { spacing, fontSizes, fontWeights, radius, shadows, avatarColors, gradient } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { getGreeting, getInitials, formatCurrency, formatMonthShort, formatDate } from '../../utils/format';
import { getCurrentMonthIST } from '../../../domain/common/date-utils';

type DashboardData = {
  children: ChildSummary[];
  payments: PaymentHistoryItem[];
};

function getAvatarColor(index: number, isDark: boolean): string {
  const palette = isDark ? avatarColors.dark : avatarColors.light;
  return palette[index % palette.length]!;
}

/**
 * Payments made within the given month (YYYY-MM). Used for the "Paid This
 * Month" banner so its amount AND count both reflect the current month —
 * `payments.length` (all-time) must not be paired with a this-month total.
 */
export function paymentsInMonth<T extends { paidAt?: string | null }>(
  payments: T[],
  monthKey: string,
): T[] {
  return payments.filter((p) => p.paidAt?.startsWith(monthKey));
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
    try {
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
    } catch (e) {
      if (__DEV__) console.error('[ParentDashboardScreen] Load failed:', e);
      if (mountedRef.current) {
        setError('Failed to load dashboard. Pull to retry.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
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
    try {
      await load();
    } catch {
      // Handled inside load
    }
  }, [load]);

  const { children, payments } = data;

  // The product reality today is one student per parent email, but the
  // backend permits N children. We collapse the UX for the common case
  // (singular labels, jump straight to ChildDetail) while still letting
  // the list view appear automatically for a hypothetical sibling.
  const isSingle = children.length === 1;
  const onlyChild = isSingle ? children[0]! : null;

  const goToChildren = useCallback(() => {
    if (onlyChild) {
      navigation.navigate('Children', {
        screen: 'ChildDetail',
        params: { studentId: onlyChild.studentId, fullName: onlyChild.fullName },
      });
    } else {
      navigation.navigate('Children');
    }
  }, [navigation, onlyChild]);

  const avgAttendance = children.length > 0
    ? (() => {
        const withAttendance = children.filter((c) => c.currentMonthAttendancePercent != null);
        if (withAttendance.length === 0) return null;
        const total = withAttendance.reduce((sum, c) => sum + (c.currentMonthAttendancePercent ?? 0), 0);
        return Math.round(total / withAttendance.length);
      })()
    : null;

  const totalMonthlyFee = children.reduce((sum, c) => sum + c.monthlyFee, 0);
  const currentMonth = getCurrentMonthIST();
  // "Paid This Month" — both the amount and the count must use this month's
  // payments. Previously the count used the whole list (all-time), which read
  // as "N payments this month" next to a this-month total.
  const paymentsThisMonth = paymentsInMonth(payments, currentMonth);
  const totalPaid = paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);
  const recentPayments = payments.slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
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
            <AvatarImage url={user.profilePhotoUrl} style={styles.profileImage} />
          ) : (
            <>
              <LinearGradient
                colors={[gradient.start, gradient.end]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <AppIcon name="account-circle-outline" size={28} color="#FFFFFF" />
            </>
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
              onPress={goToChildren}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconCircle, { overflow: 'hidden' }]}>
                <LinearGradient
                  colors={[gradient.start, gradient.end]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <AppIcon name="human-child" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.statValue}>{children.length}</Text>
              <Text style={styles.statLabel}>{isSingle ? 'Child' : 'Children'}</Text>
            </TouchableOpacity>

            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.successBg }]}>
                
                <AppIcon name="calendar-check-outline" size={20} color={colors.success} />
              </View>
              <Text style={styles.statValue}>
                {avgAttendance != null ? `${avgAttendance}%` : '--'}
              </Text>
              <Text style={styles.statLabel}>Attendance</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconCircle, { backgroundColor: colors.infoBg }]}>
                
                <AppIcon name="currency-inr" size={20} color={colors.info} />
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
                onPress={goToChildren}
                activeOpacity={0.7}
                accessibilityLabel={isSingle ? 'My Child' : 'My Children'}
                accessibilityRole="button"
              >
                <View style={[styles.quickActionIcon, { overflow: 'hidden' }]}>
                  <LinearGradient
                    colors={[gradient.start, gradient.end]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <AppIcon name="account-multiple-outline" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.quickActionLabel}>
                  My{'\n'}{isSingle ? 'Child' : 'Children'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Payments')}
                activeOpacity={0.7}
                accessibilityLabel="Payment History"
                accessibilityRole="button"
              >
                <View style={[styles.quickActionIcon, { backgroundColor: colors.successBg }]}>

                  <AppIcon name="credit-card-outline" size={20} color={colors.success} />
                </View>
                <Text style={styles.quickActionLabel}>Payment{'\n'}History</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('More', { screen: 'AcademyInfo' })}
                activeOpacity={0.7}
                accessibilityLabel="Academy Info"
                accessibilityRole="button"
              >
                <View style={[styles.quickActionIcon, { backgroundColor: colors.infoBg }]}>

                  <AppIcon name="school-outline" size={20} color={colors.info} />
                </View>
                <Text style={styles.quickActionLabel}>Academy{'\n'}Info</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('More', { screen: 'ParentProfile' })}
                activeOpacity={0.7}
                accessibilityLabel="My Profile"
                accessibilityRole="button"
              >
                <View style={[styles.quickActionIcon, { backgroundColor: colors.warningBg }]}>

                  <AppIcon name="account-edit-outline" size={20} color={colors.warning} />
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
                  <View style={[styles.sectionHeaderIcon, { backgroundColor: colors.warningBg }]}>
                    <AppIcon name="heart-outline" size={18} color={colors.warning} />
                  </View>
                  <Text
                    style={styles.sectionTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    maxFontSizeMultiplier={1.2}
                  >
                    {isSingle ? 'My Child' : 'My Children'}
                  </Text>
                </View>
                {!isSingle && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Children')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.viewAllLink}>View All</Text>
                  </TouchableOpacity>
                )}
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

                // All paid months for this child. Matched by studentName since
                // PaymentHistoryItem doesn't expose studentId.
                const allChildPayments = payments.filter(
                  (p) => p.studentName === child.fullName,
                );
                const currentMonthPayment = allChildPayments.find(
                  (p) => p.monthKey === currentMonth,
                );
                // Past months — most recent two (excluding current).
                const pastPayments = allChildPayments
                  .filter((p) => p.monthKey !== currentMonth)
                  .slice(0, 2);

                // Fee surfaced to parent: ALWAYS prioritize the oldest unpaid
                // month. If nothing is unpaid, fall back to the green
                // "paid this month" card. Otherwise the parent could see
                // "April PAID" while March 2026 quietly remains unpaid forever.
                const hasUnpaidBacklog = child.totalUnpaidMonths > 0;
                const surfacedMonthKey = child.currentMonthFeeMonthKey ?? currentMonth;
                const olderPendingCount = Math.max(0, child.totalUnpaidMonths - 1);

                return (
                  <View key={child.studentId} style={styles.childCard}>
                    <TouchableOpacity
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
                          {/* Only render the status dot when the child is *not*
                              active. Always-on green dots for active children
                              were ambient noise that visually competed with
                              the attendance column to the right. */}
                          {child.status !== 'ACTIVE' && (
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: colors.warning },
                              ]}
                            />
                          )}
                        </View>
                        <Text style={styles.childFee}>
                          {formatCurrency(child.monthlyFee)}
                          <Text style={styles.childFeeLabel}> / month</Text>
                        </Text>
                      </View>
                      {attendPct != null ? (
                        <View style={styles.childAttendance}>
                          <Text style={[styles.childAttendanceValue, { color: attendColor }]}>
                            {attendPct}%
                          </Text>
                          <Text style={styles.childAttendanceLabel}>Attendance</Text>
                        </View>
                      ) : (
                        // No attendance data this month yet — render a softer
                        // "No data yet" pill instead of an empty "--/Attendance"
                        // pair which read as broken UI on the dashboard.
                        <View style={styles.childAttendanceEmpty}>
                          <AppIcon
                            name="calendar-blank-outline"
                            size={14}
                            color={colors.textDisabled}
                          />
                          <Text style={styles.childAttendanceEmptyText}>No data yet</Text>
                        </View>
                      )}
                      <AppIcon name="chevron-right" size={18} color={colors.textDisabled} />
                    </TouchableOpacity>

                    <View style={styles.childPayments}>
                      {/* Surfaced fee card. Priority order:
                          1. Oldest unpaid month (clear backlog first)
                          2. Current-month paid receipt (positive feedback)
                          3. Nothing (current-month fee not generated yet) */}
                      {hasUnpaidBacklog ? (
                        <View style={[styles.monthCard, styles.monthCardAccentPending]}>
                          <View style={[styles.monthAccentBar, { backgroundColor: colors.warning }]} />
                          <View style={styles.monthCardBody}>
                            <View style={styles.monthCardMeta}>
                              <Text style={styles.monthCardMonth}>
                                {formatMonthShort(surfacedMonthKey)}
                              </Text>
                              <View style={[styles.statusPill, styles.statusPillPending]}>
                                <View style={[styles.statusPillDot, { backgroundColor: colors.warning }]} />
                                <Text style={[styles.statusPillText, { color: colors.warning }]}>Due</Text>
                              </View>
                            </View>
                            <Text style={styles.monthCardAmount}>
                              {formatCurrency(child.currentMonthFeeAmount ?? child.monthlyFee)}
                            </Text>
                            {olderPendingCount > 0 && (
                              <Text style={styles.morePendingHint}>
                                +{olderPendingCount} more pending • ₹
                                {child.totalUnpaidAmount.toLocaleString('en-IN')} total
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            style={styles.payNowBtn}
                            activeOpacity={0.85}
                            onPress={() => {
                              if (child.currentMonthFeeDueId) {
                                navigation.navigate('Children', {
                                  screen: 'ManualPayment',
                                  params: {
                                    feeDueId: child.currentMonthFeeDueId,
                                    studentId: child.studentId,
                                    monthKey: surfacedMonthKey,
                                    amount: child.currentMonthFeeAmount ?? child.monthlyFee,
                                  },
                                });
                              } else {
                                // Fee due not yet generated — fall back to ChildDetail
                                // so the parent can still see the child's context.
                                navigation.navigate('Children', {
                                  screen: 'ChildDetail',
                                  params: { studentId: child.studentId, fullName: child.fullName },
                                });
                              }
                            }}
                          >
                            <LinearGradient
                              colors={[gradient.start, gradient.end]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                            <Text style={styles.payNowBtnText}>Pay</Text>
                            <AppIcon name="arrow-right" size={14} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      ) : currentMonthPayment ? (
                        <TouchableOpacity
                          style={[styles.monthCard, styles.monthCardAccentPaid]}
                          activeOpacity={0.7}
                          onPress={() =>
                            navigation.navigate('Payments', {
                              screen: 'Receipt',
                              params: { feeDueId: currentMonthPayment.feeDueId },
                            })
                          }
                        >
                          <View style={[styles.monthAccentBar, { backgroundColor: colors.success }]} />
                          <View style={styles.monthCardBody}>
                            <View style={styles.monthCardMeta}>
                              <Text style={styles.monthCardMonth}>
                                {formatMonthShort(currentMonth)}
                              </Text>
                              <View style={[styles.statusPill, styles.statusPillPaid]}>
                                <View style={[styles.statusPillDot, { backgroundColor: colors.success }]} />
                                <Text style={[styles.statusPillText, { color: colors.success }]}>Paid</Text>
                              </View>
                            </View>
                            <Text style={styles.monthCardAmount}>
                              {formatCurrency(currentMonthPayment.amount)}
                            </Text>
                          </View>
                          <View style={styles.monthCardTrailing}>
                            <AppIcon name="file-document-outline" size={18} color={colors.textDisabled} />
                          </View>
                        </TouchableOpacity>
                      ) : null}

                      {/* Past-month chips */}
                      {pastPayments.length > 0 && (
                        <View style={styles.childPaymentsRow}>
                          {pastPayments.map((p) => (
                            <TouchableOpacity
                              key={p.receiptNumber}
                              style={styles.paymentChip}
                              activeOpacity={0.7}
                              onPress={() =>
                                navigation.navigate('Payments', {
                                  screen: 'Receipt',
                                  params: { feeDueId: p.feeDueId },
                                })
                              }
                            >
                              <View style={styles.paymentChipDot} />
                              <View style={styles.paymentChipText}>
                                <Text style={styles.paymentChipMonth}>
                                  {formatMonthShort(p.monthKey)}
                                </Text>
                                <Text style={styles.paymentChipAmount}>
                                  {formatCurrency(p.amount)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}


          {/* ── Payment Summary ── */}
          {payments.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={[styles.sectionHeaderIcon, { backgroundColor: colors.successBg }]}>
                    
                    <AppIcon name="credit-card-check-outline" size={18} color={colors.success} />
                  </View>
                  <Text
                    style={styles.sectionTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    maxFontSizeMultiplier={1.2}
                  >
                    Recent Payments
                  </Text>
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
                
                <AppIcon name="check-decagram" size={20} color={colors.success} />
                <View style={styles.totalPaidInfo}>
                  <Text style={styles.totalPaidLabel}>Paid This Month</Text>
                  <Text style={styles.totalPaidValue}>{formatCurrency(totalPaid)}</Text>
                </View>
                <View style={styles.totalPaidCount}>
                  <Text style={styles.totalPaidCountValue}>{paymentsThisMonth.length}</Text>
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
                    
                    <AppIcon name="receipt" size={16} color={colors.success} />
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

        </View>
      )}
    </ScrollView>
    </SafeAreaView>
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
    flexShrink: 1,
  },
  sectionHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
    flex: 1,
    flexShrink: 1,
  },
  viewAllLink: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flexShrink: 0,
  },

  /* ── Children Rows ──────────────────────────────── */
  childCard: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
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
  childAttendanceEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.bgSubtle,
    marginRight: spacing.sm,
  },
  childAttendanceEmptyText: {
    fontSize: fontSizes.xs,
    color: colors.textDisabled,
    fontWeight: fontWeights.medium,
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

  /* ── Child-scoped recent payments (3 chips under each child) ─────── */
  childPayments: {
    paddingLeft: 52, // align with childInfo (avatar width + gap)
    paddingRight: 4,
    paddingTop: 4,
    gap: 6,
  },
  /* Current-month card — subtle dark surface, thin accent bar on the left.
     Status pill + large amount on the right of a gradient "Pay" pill when due. */
  monthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    overflow: 'hidden',
  },
  monthCardAccentPaid: {
    borderColor: colors.border,
  },
  monthCardAccentPending: {
    borderColor: colors.border,
  },
  monthAccentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  monthCardBody: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
  },
  monthCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  monthCardMonth: {
    fontSize: 11,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  monthCardAmount: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  morePendingHint: {
    fontSize: fontSizes.xs,
    color: colors.warning,
    fontWeight: fontWeights.medium,
    marginTop: 2,
  },
  monthCardTrailing: {
    paddingHorizontal: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusPillPaid: {
    backgroundColor: `${colors.success}15`,
    borderColor: `${colors.success}35`,
  },
  statusPillPending: {
    backgroundColor: `${colors.warning}15`,
    borderColor: `${colors.warning}35`,
  },
  statusPillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  payNowBtnText: {
    fontSize: 12,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  childPaymentsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paymentChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  paymentChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  paymentChipText: {
    flex: 1,
    minWidth: 0,
  },
  paymentChipMonth: {
    fontSize: 10,
    fontWeight: fontWeights.semibold,
    color: colors.successText,
    letterSpacing: 0.2,
  },
  paymentChipAmount: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.successText,
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
    backgroundColor: colors.successBg,
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
