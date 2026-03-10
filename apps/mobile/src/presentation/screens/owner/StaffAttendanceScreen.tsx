import React, { useState, useCallback, useMemo, memo } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StaffStackParamList } from '../../navigation/StaffStack';
import type { DailyStaffAttendanceItem } from '../../../domain/staff-attendance/staff-attendance.types';
import { useStaffAttendance } from '../../../application/staff-attendance/use-staff-attendance';
import {
  getDailyStaffAttendance,
  markStaffAttendance,
} from '../../../infra/staff-attendance/staff-attendance-api';
import { getTodayIST } from '../../../application/attendance/use-attendance';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { DatePickerRow } from '../../components/attendance/DatePickerRow';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { AppCard } from '../../components/ui/AppCard';
import { spacing, fontSizes, fontWeights } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<StaffStackParamList, 'StaffAttendance'>;

const staffAttendanceApi = { getDailyStaffAttendance, markStaffAttendance };

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMonthFromDate(dateStr: string): string {
  return dateStr.substring(0, 7);
}

type StaffAttendanceRowProps = {
  item: DailyStaffAttendanceItem;
  onToggle: () => void;
};

function StaffAttendanceRowComponent({ item, onToggle }: StaffAttendanceRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPresent = item.status === 'PRESENT';

  return (
    <AppCard style={styles.rowContainer} testID={`staff-attendance-row-${item.staffUserId}`}>
      <Text style={styles.rowName} numberOfLines={1}>
        {item.fullName}
      </Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowStatus, isPresent ? styles.present : styles.absent]}>
          {isPresent ? 'P' : 'A'}
        </Text>
        <Toggle
          value={isPresent}
          onValueChange={onToggle}
          disabled={false}
          accessibilityLabel={`${item.fullName} attendance toggle`}
          testID={`toggle-staff-${item.staffUserId}`}
        />
      </View>
    </AppCard>
  );
}

const StaffAttendanceRow = memo(StaffAttendanceRowComponent);

export function StaffAttendanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();

  const [selectedDate, setSelectedDate] = useState(getTodayIST);
  const [refreshing, setRefreshing] = useState(false);

  const { items, loading, loadingMore, error, refetch, fetchMore, toggleStatus } =
    useStaffAttendance(selectedDate, staffAttendanceApi);

  const today = useMemo(() => getTodayIST(), []);
  const isToday = selectedDate === today;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const goToPrev = useCallback(() => {
    setSelectedDate((d) => addDays(d, -1));
  }, []);

  const goToNext = useCallback(() => {
    if (!isToday) {
      setSelectedDate((d) => addDays(d, 1));
    }
  }, [isToday]);

  const goToToday = useCallback(() => {
    setSelectedDate(getTodayIST());
  }, []);

  const handleDailyReport = useCallback(() => {
    navigation.navigate('StaffAttendanceDailyReport', { date: selectedDate });
  }, [navigation, selectedDate]);

  const handleMonthlySummary = useCallback(() => {
    navigation.navigate('StaffAttendanceMonthlySummary', {
      month: getMonthFromDate(selectedDate),
    });
  }, [navigation, selectedDate]);

  const renderItem = useCallback(
    ({ item }: { item: DailyStaffAttendanceItem }) => (
      <StaffAttendanceRow
        item={item}
        onToggle={() => toggleStatus(item.staffUserId)}
      />
    ),
    [toggleStatus],
  );

  const keyExtractor = useCallback(
    (item: DailyStaffAttendanceItem) => item.staffUserId,
    [],
  );

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, colors, styles]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <SectionHeader title="Staff Attendance" />
        <DatePickerRow
          date={selectedDate}
          onPrevious={goToPrev}
          onNext={goToNext}
          onToday={goToToday}
          isToday={isToday}
        />
        <View style={styles.headerButtons}>
          <View style={styles.headerButton}>
            <Button
              title="Daily Report"
              variant="secondary"
              onPress={handleDailyReport}
              testID="staff-daily-report-button"
            />
          </View>
          <View style={styles.headerButton}>
            <Button
              title="Monthly Summary"
              variant="secondary"
              onPress={handleMonthlySummary}
              testID="staff-monthly-summary-button"
            />
          </View>
        </View>
      </View>

      {error && <InlineError message={error.message} onRetry={refetch} />}

      {loading && !refreshing ? (
        <View testID="skeleton-container" style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : !loading && items.length === 0 ? (
        <EmptyState message="No staff members found" />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          testID="staff-attendance-list"
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    padding: spacing.base,
    paddingBottom: 0,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    flex: 1,
  },
  skeletons: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  rowName: {
    flex: 1,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowStatus: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    width: 20,
    textAlign: 'center',
  },
  present: {
    color: colors.success,
  },
  absent: {
    color: colors.danger,
  },
});
