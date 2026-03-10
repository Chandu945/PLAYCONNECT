import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import type { StaffStackParamList } from '../../navigation/StaffStack';
import type { AppError } from '../../../domain/common/errors';
import type { DailyStaffReportResult } from '../../../domain/staff-attendance/staff-attendance.types';
import { getStaffDailyReportUseCase } from '../../../application/staff-attendance/use-cases/get-staff-daily-report.usecase';
import { getStaffDailyReport } from '../../../infra/staff-attendance/staff-attendance-api';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { Badge } from '../../components/ui/Badge';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Route = RouteProp<StaffStackParamList, 'StaffAttendanceDailyReport'>;

const reportApi = { getStaffDailyReport };

export function StaffAttendanceDailyReportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Route>();
  const date = route.params?.date ?? '';

  const [report, setReport] = useState<DailyStaffReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getStaffDailyReportUseCase({ staffAttendanceApi: reportApi }, date);

    if (!mountedRef.current) return;

    if (result.ok) {
      setReport(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [date]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderAbsentItem = useCallback(
    ({ item }: { item: { staffUserId: string; fullName: string } }) => (
      <View style={styles.absentRow} testID={`absent-staff-${item.staffUserId}`}>
        <Text style={styles.absentName}>{item.fullName}</Text>
        <Badge label="ABSENT" variant="danger" />
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback((item: { staffUserId: string }) => item.staffUserId, []);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <SkeletonTile />
          <SkeletonTile />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <InlineError message={error.message} onRetry={load} />
        </View>
      </View>
    );
  }

  if (!report) return null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.dateLabel}>{report.date}</Text>

      <View style={styles.countsRow}>
        <View style={styles.countBox}>
          <Text style={styles.countNumber}>{report.presentCount}</Text>
          <Text style={styles.countLabel}>Present</Text>
        </View>
        <View style={styles.countBox}>
          <Text style={[styles.countNumber, styles.absentCount]}>{report.absentCount}</Text>
          <Text style={styles.countLabel}>Absent</Text>
        </View>
      </View>

      {report.absentStaff.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Absent Staff</Text>
          <FlatList
            data={report.absentStaff}
            renderItem={renderAbsentItem}
            keyExtractor={keyExtractor}
            scrollEnabled={false}
            testID="absent-staff-list"
          />
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
  },
  dateLabel: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  countsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  countBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    alignItems: 'center',
    ...shadows.sm,
  },
  countNumber: {
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.bold,
    color: colors.success,
  },
  absentCount: {
    color: colors.danger,
  },
  countLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  absentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  absentName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
});
