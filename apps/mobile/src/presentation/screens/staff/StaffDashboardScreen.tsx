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

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
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

          {/* ── Today's Absent List ── */}
          {attendance && attendance.absentCount > 0 && (
            <View style={styles.absentCard}>
              <View style={styles.absentHeader}>
                <View style={[styles.statIcon, { backgroundColor: '#fef2f2', width: 28, height: 28 }]}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="account-alert-outline" size={16} color={colors.danger} />
                </View>
                <Text style={styles.absentTitle}>Absent Today</Text>
                <View style={styles.absentBadge}>
                  <Text style={styles.absentBadgeText}>{attendance.absentCount}</Text>
                </View>
              </View>
              {attendance.absentStudents.slice(0, 5).map((s) => (
                <View key={s.studentId} style={styles.absentRow}>
                  <View style={styles.absentAvatar}>
                    <Text style={styles.absentInitial}>{s.fullName[0]}</Text>
                  </View>
                  <Text style={styles.absentName} numberOfLines={1}>{s.fullName}</Text>
                </View>
              ))}
              {attendance.absentStudents.length > 5 && (
                <TouchableOpacity
                  style={styles.viewAllBtn}
                  onPress={() => navigation.navigate('Attendance' as never)}
                >
                  <Text style={styles.viewAllText}>
                    View all {attendance.absentCount} absent students
                  </Text>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name="chevron-right" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
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

  /* ── Absent Card ────────────────────────────────── */
  absentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  absentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  absentTitle: {
    flex: 1,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  absentBadge: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.full,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  absentBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.danger,
  },
  absentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
