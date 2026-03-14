import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StaffTabParamList } from '../../navigation/StaffTabs';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import type { DailyReportResult } from '../../../domain/attendance/attendance.types';
import type { EventSummary } from '../../../domain/event/event.types';
import type { EnquirySummary } from '../../../domain/enquiry/enquiry.types';
import type { PaymentRequestItem } from '../../../domain/fees/payment-requests.types';
import { getDailyReport } from '../../../infra/attendance/attendance-api';
import { listPaymentRequests } from '../../../infra/fees/payment-requests-api';
import { getEventSummary } from '../../../infra/event/event-api';
import { getEnquirySummary } from '../../../infra/enquiry/enquiry-api';
import { useFAB } from '../../context/FABContext';
import { useFocusEffect } from '@react-navigation/native';
import { BirthdayWidget } from '../../components/dashboard/BirthdayWidget';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { getTodayIST } from '../../../domain/common/date-utils';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<StaffTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<MoreStackParamList>
>;

type DashboardData = {
  attendance: DailyReportResult | null;
  pendingRequests: PaymentRequestItem[];
  eventSummary: EventSummary | null;
  enquirySummary: EnquirySummary | null;
};

function formatCurrency(n: number): string {
  return `\u20B9${n.toLocaleString('en-IN')}`;
}

export function StaffDashboardScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { showFAB, hideFAB } = useFAB();

  const [data, setData] = useState<DashboardData>({
    attendance: null,
    pendingRequests: [],
    eventSummary: null,
    enquirySummary: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const today = getTodayIST();

    const [attendanceRes, requestsRes, eventsRes, enquiryRes] = await Promise.all([
      getDailyReport(today),
      listPaymentRequests('PENDING'),
      getEventSummary(),
      getEnquirySummary(),
    ]);

    if (!mountedRef.current) return;

    setData({
      attendance: attendanceRes.ok ? attendanceRes.value : null,
      pendingRequests: requestsRes.ok ? requestsRes.value.data : [],
      eventSummary: eventsRes.ok ? eventsRes.value : null,
      enquirySummary: enquiryRes.ok ? enquiryRes.value : null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      showFAB();
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
      } else {
        load();
      }
      return () => hideFAB();
    }, [showFAB, hideFAB, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const { attendance, pendingRequests, eventSummary, enquirySummary } = data;

  const totalStudents = attendance ? attendance.presentCount + attendance.absentCount : 0;
  const attendancePct = totalStudents > 0
    ? Math.round((attendance!.presentCount / totalStudents) * 100)
    : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
      showsVerticalScrollIndicator={false}
      testID="staff-dashboard-scroll"
    >
      {loading && !refreshing ? (
        <View testID="staff-skeleton">
          <View style={styles.gridRow}>
            <SkeletonTile />
            <SkeletonTile />
          </View>
          <View style={styles.gridRow}>
            <SkeletonTile />
            <SkeletonTile />
          </View>
        </View>
      ) : (
        <View testID="staff-dashboard-content">
          {/* ── Quick Stats Grid ── */}
          <View style={styles.gridRow}>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('Attendance' as never)}
              activeOpacity={0.7}
              testID="stat-attendance"
            >
              <View style={[styles.statIcon, { backgroundColor: '#ecfdf5' }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="calendar-check-outline" size={22} color={colors.success} />
              </View>
              <Text style={styles.statValue}>
                {attendance ? attendance.presentCount : '–'}
              </Text>
              <Text style={styles.statLabel}>Present Today</Text>
              {attendance && attendance.absentCount > 0 && (
                <View style={styles.statSub}>
                  <Text style={styles.statSubText}>
                    {attendance.absentCount} absent
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('Fees' as never)}
              activeOpacity={0.7}
              testID="stat-pending-requests"
            >
              <View style={[styles.statIcon, { backgroundColor: colors.primarySoft }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="file-document-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.statValue}>
                {pendingRequests.length}
              </Text>
              <Text style={styles.statLabel}>Pending Requests</Text>
              {pendingRequests.length > 0 && (
                <View style={[styles.statSub, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.statSubText, { color: colors.primary }]}>
                    Awaiting approval
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.gridRow}>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('More', { screen: 'EventList' } as never)}
              activeOpacity={0.7}
              testID="stat-events"
            >
              <View style={[styles.statIcon, { backgroundColor: '#f0f0ff' }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="calendar-star" size={22} color="#6366f1" />
              </View>
              <Text style={styles.statValue}>
                {eventSummary ? eventSummary.thisMonth.upcoming : '–'}
              </Text>
              <Text style={styles.statLabel}>Upcoming Events</Text>
              {eventSummary && eventSummary.thisMonth.total > 0 && (
                <View style={[styles.statSub, { backgroundColor: '#f0f0ff' }]}>
                  <Text style={[styles.statSubText, { color: '#6366f1' }]}>
                    {eventSummary.thisMonth.total} this month
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigation.navigate('More', { screen: 'EnquiryList' } as never)}
              activeOpacity={0.7}
              testID="stat-enquiries"
            >
              <View style={[styles.statIcon, { backgroundColor: '#fef3e7' }]}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="account-question-outline" size={22} color="#e67e22" />
              </View>
              <Text style={styles.statValue}>
                {enquirySummary ? enquirySummary.todayFollowUp : '–'}
              </Text>
              <Text style={styles.statLabel}>Follow-ups Today</Text>
              {enquirySummary && enquirySummary.active > 0 && (
                <View style={[styles.statSub, { backgroundColor: '#fef3e7' }]}>
                  <Text style={[styles.statSubText, { color: '#e67e22' }]}>
                    {enquirySummary.active} active
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Quick Actions ── */}
          <View style={styles.quickActionsCard}>
            <Text style={styles.sectionLabel}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Attendance' as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#ecfdf5' }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="calendar-check-outline" size={20} color={colors.success} />
                </View>
                <Text style={styles.quickActionLabel}>Mark{'\n'}Attendance</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Students' as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: colors.primarySoft }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="account-plus-outline" size={20} color={colors.primary} />
                </View>
                <Text style={styles.quickActionLabel}>Add{'\n'}Student</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('Fees' as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#f0f0ff' }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="cash-plus" size={20} color="#6366f1" />
                </View>
                <Text style={styles.quickActionLabel}>Fee{'\n'}Request</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => navigation.navigate('More', { screen: 'AddEnquiry' } as never)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#fef3e7' }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="account-question-outline" size={20} color="#e67e22" />
                </View>
                <Text style={styles.quickActionLabel}>New{'\n'}Enquiry</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Today's Attendance Overview ── */}
          {attendance && (
            <TouchableOpacity
              style={styles.attendanceCard}
              onPress={() => navigation.navigate('Attendance' as never)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.cardHeaderIcon, { backgroundColor: '#ecfdf5' }]}>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name="calendar-check-outline" size={18} color={colors.success} />
                  </View>
                  <Text style={styles.cardTitle}>Today's Attendance</Text>
                </View>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
              </View>

              <View style={styles.attendanceStats}>
                <View style={styles.attendanceStat}>
                  <Text style={[styles.attendanceStatValue, { color: colors.success }]}>
                    {attendance.presentCount}
                  </Text>
                  <Text style={styles.attendanceStatLabel}>Present</Text>
                </View>
                <View style={styles.attendanceDivider} />
                <View style={styles.attendanceStat}>
                  <Text style={[styles.attendanceStatValue, { color: colors.danger }]}>
                    {attendance.absentCount}
                  </Text>
                  <Text style={styles.attendanceStatLabel}>Absent</Text>
                </View>
                <View style={styles.attendanceDivider} />
                <View style={styles.attendanceStat}>
                  <Text style={styles.attendanceStatValue}>{totalStudents}</Text>
                  <Text style={styles.attendanceStatLabel}>Total</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${attendancePct}%` as unknown as number },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {totalStudents > 0 ? `${attendancePct}% attendance rate` : 'No attendance data'}
              </Text>

              {attendance.absentCount > 0 && (
                <View style={styles.absentPreview}>
                  <Text style={styles.absentPreviewTitle}>Absent Students</Text>
                  {attendance.absentStudents.slice(0, 3).map((s) => (
                    <View key={s.studentId} style={styles.absentRow}>
                      <View style={styles.absentAvatar}>
                        <Text style={styles.absentInitial}>{s.fullName[0]}</Text>
                      </View>
                      <Text style={styles.absentName} numberOfLines={1}>{s.fullName}</Text>
                    </View>
                  ))}
                  {attendance.absentStudents.length > 3 && (
                    <Text style={styles.absentMoreText}>
                      +{attendance.absentStudents.length - 3} more absent
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* ── Pending Requests Preview ── */}
          {pendingRequests.length > 0 && (
            <TouchableOpacity
              style={styles.requestsCard}
              onPress={() => navigation.navigate('Fees' as never)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.cardHeaderIcon, { backgroundColor: colors.primarySoft }]}>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name="file-document-outline" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.cardTitle}>My Pending Requests</Text>
                </View>
                <View style={styles.requestsBadge}>
                  <Text style={styles.requestsBadgeText}>{pendingRequests.length}</Text>
                </View>
              </View>

              {pendingRequests.slice(0, 3).map((req) => (
                <View key={req.id} style={styles.requestRow}>
                  <View style={styles.requestAvatar}>
                    <Text style={styles.requestInitial}>{(req.studentName ?? '?')[0]}</Text>
                  </View>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestName} numberOfLines={1}>
                      {req.studentName ?? 'Unknown'}
                    </Text>
                    <Text style={styles.requestMeta}>
                      {req.monthKey} · {formatCurrency(req.amount)}
                    </Text>
                  </View>
                  <View style={styles.requestStatusBadge}>
                    <Text style={styles.requestStatusText}>Pending</Text>
                  </View>
                </View>
              ))}

              {pendingRequests.length > 3 && (
                <View style={styles.viewAllBtn}>
                  <Text style={styles.viewAllText}>
                    View all {pendingRequests.length} requests
                  </Text>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="chevron-right" size={16} color={colors.primary} />
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* ── Enquiry Summary ── */}
          {enquirySummary && enquirySummary.total > 0 && (
            <TouchableOpacity
              style={styles.enquiryCard}
              onPress={() => navigation.navigate('More', { screen: 'EnquiryList' } as never)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.cardHeaderIcon, { backgroundColor: '#fef3e7' }]}>
                    {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                    <Icon name="account-question-outline" size={18} color="#e67e22" />
                  </View>
                  <Text style={styles.cardTitle}>Enquiries</Text>
                </View>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
              </View>

              <View style={styles.enquiryStats}>
                <View style={styles.enquiryStat}>
                  <Text style={[styles.enquiryStatValue, { color: '#e67e22' }]}>
                    {enquirySummary.active}
                  </Text>
                  <Text style={styles.enquiryStatLabel}>Active</Text>
                </View>
                <View style={styles.attendanceDivider} />
                <View style={styles.enquiryStat}>
                  <Text style={[styles.enquiryStatValue, { color: colors.primary }]}>
                    {enquirySummary.todayFollowUp}
                  </Text>
                  <Text style={styles.enquiryStatLabel}>Follow-up Today</Text>
                </View>
                <View style={styles.attendanceDivider} />
                <View style={styles.enquiryStat}>
                  <Text style={[styles.enquiryStatValue, { color: colors.success }]}>
                    {enquirySummary.closed}
                  </Text>
                  <Text style={styles.enquiryStatLabel}>Closed</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* ── Birthday Widget ── */}
          <BirthdayWidget />
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

  /* ── Grid ───────────────────────────────────────── */
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },

  /* ── Stat Card ──────────────────────────────────── */
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    alignItems: 'center',
    ...shadows.sm,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: fontSizes['3xl'],
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
  statSub: {
    marginTop: spacing.sm,
    backgroundColor: '#ecfdf5',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statSubText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.success,
  },

  /* ── Quick Actions ──────────────────────────────── */
  quickActionsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginTop: spacing.sm,
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

  /* ── Card shared ────────────────────────────────── */
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },

  /* ── Attendance Card ────────────────────────────── */
  attendanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  attendanceStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  attendanceStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  attendanceStatValue: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  attendanceStatLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    marginTop: 2,
  },
  attendanceDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: radius.full,
  },
  progressLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  absentPreview: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  absentPreviewTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
    marginBottom: spacing.xs,
  },
  absentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  absentAvatar: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  absentInitial: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.danger,
  },
  absentName: {
    flex: 1,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  absentMoreText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingTop: spacing.xs,
  },

  /* ── Requests Card ──────────────────────────────── */
  requestsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  requestsBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  requestsBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  requestAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  requestInitial: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  requestMeta: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  requestStatusBadge: {
    backgroundColor: '#fef3e7',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  requestStatusText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: '#e67e22',
  },

  /* ── Enquiry Card ───────────────────────────────── */
  enquiryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  enquiryStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  enquiryStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  enquiryStatValue: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  enquiryStatLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },

  /* ── Shared ─────────────────────────────────────── */
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  viewAllText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
