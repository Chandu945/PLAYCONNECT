import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { AttendanceStackParamList } from '../../navigation/AttendanceStack';
import type { DailyAttendanceItem } from '../../../domain/attendance/attendance.types';
import { useAttendance, getTodayIST } from '../../../application/attendance/use-attendance';
import { getDailyAttendance, markAttendance } from '../../../infra/attendance/attendance-api';
import { declareHoliday, removeHoliday } from '../../../infra/attendance/holidays-api';
import { declareHolidayUseCase } from '../../../application/attendance/use-cases/declare-holiday.usecase';
import { removeHolidayUseCase } from '../../../application/attendance/use-cases/remove-holiday.usecase';
import { useAuth } from '../../context/AuthContext';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { DatePickerRow } from '../../components/attendance/DatePickerRow';
import { HolidayBanner } from '../../components/attendance/HolidayBanner';
import { AttendanceHeader } from '../../components/attendance/AttendanceHeader';
import { AttendanceRow } from '../../components/attendance/AttendanceRow';
import { BatchFilterBar } from '../../components/attendance/BatchFilterBar';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<AttendanceStackParamList, 'AttendanceMain'>;

const attendanceApi = { getDailyAttendance, markAttendance };
const holidaysApiRef = { declareHoliday, removeHoliday };

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

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AttendanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [selectedDate, setSelectedDate] = useState(getTodayIST);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  const [declaringHoliday, setDeclaringHoliday] = useState(false);
  const [removingHoliday, setRemovingHoliday] = useState(false);

  const { items, loading, loadingMore, error, isHoliday, refetch, fetchMore, toggleStatus } =
    useAttendance(selectedDate, attendanceApi, selectedBatchId, debouncedSearch || null);

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

  const handleDeclareHoliday = useCallback(async () => {
    setDeclaringHoliday(true);
    await declareHolidayUseCase({ holidaysApi: holidaysApiRef }, selectedDate);
    setDeclaringHoliday(false);
    refetch();
  }, [selectedDate, refetch]);

  const handleRemoveHoliday = useCallback(async () => {
    setRemovingHoliday(true);
    await removeHolidayUseCase({ holidaysApi: holidaysApiRef }, selectedDate);
    setRemovingHoliday(false);
    refetch();
  }, [selectedDate, refetch]);

  const handleDailyReport = useCallback(() => {
    navigation.navigate('DailyReport', { date: selectedDate });
  }, [navigation, selectedDate]);

  const handleMonthlySummary = useCallback(() => {
    navigation.navigate('MonthlySummary', { month: getMonthFromDate(selectedDate) });
  }, [navigation, selectedDate]);

  const openSearch = useCallback(() => {
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchActive(false);
    setSearchText('');
    setDebouncedSearch('');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: DailyAttendanceItem }) => (
      <AttendanceRow
        item={item}
        onToggle={() => toggleStatus(item.studentId)}
        disabled={isHoliday}
      />
    ),
    [toggleStatus, isHoliday],
  );

  const keyExtractor = useCallback((item: DailyAttendanceItem) => item.studentId, []);

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
      {/* ── Navbar ─────────────────────────────────────── */}
      <View style={styles.navbar}>
        {searchActive ? (
          <View style={styles.searchBar}>
            <TouchableOpacity onPress={closeSearch} style={styles.navBtn}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="arrow-left" size={22} color={colors.text} />
            </TouchableOpacity>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search by name"
              placeholderTextColor={colors.textDisabled}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
              testID="attendance-search-input"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} style={styles.navBtn}>
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.titleBar}>
            <View>
              <Text style={styles.navTitle}>Attendance</Text>
              <Text style={styles.navSubtitle}>{formatDateLabel(selectedDate)}</Text>
            </View>
            <View style={styles.navActions}>
              <TouchableOpacity onPress={openSearch} style={styles.navBtn} testID="search-button">
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="magnify" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowFilters((v) => !v)}
                style={styles.navBtn}
                testID="filter-button"
              >
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="filter-variant" size={22} color={colors.text} />
                {selectedBatchId !== null && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>1</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Filter Panel ──────────────────────────────── */}
      {showFilters && (
        <View style={styles.filterPanel}>
          <DatePickerRow
            date={selectedDate}
            onPrevious={goToPrev}
            onNext={goToNext}
            onToday={goToToday}
            isToday={isToday}
          />
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Batch</Text>
            <BatchFilterBar selectedBatchId={selectedBatchId} onChange={setSelectedBatchId} />
          </View>
          {selectedBatchId !== null && (
            <TouchableOpacity
              style={styles.clearFilters}
              onPress={() => setSelectedBatchId(null)}
            >
              <Text style={styles.clearFiltersText}>Clear Batch Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Date + Action Buttons (always visible when filter panel is closed) ── */}
      {!showFilters && (
        <View style={styles.controlsSection}>
          <DatePickerRow
            date={selectedDate}
            onPrevious={goToPrev}
            onNext={goToNext}
            onToday={goToToday}
            isToday={isToday}
          />
          <AttendanceHeader
            isOwner={isOwner}
            isHoliday={isHoliday}
            onDeclareHoliday={handleDeclareHoliday}
            onDailyReport={handleDailyReport}
            onMonthlySummary={handleMonthlySummary}
            declaringHoliday={declaringHoliday}
          />
        </View>
      )}

      {isHoliday && (
        <HolidayBanner
          isOwner={isOwner}
          onRemoveHoliday={handleRemoveHoliday}
          removing={removingHoliday}
        />
      )}

      {error && <InlineError message={error.message} onRetry={refetch} />}

      {loading && !refreshing ? (
        <View testID="skeleton-container" style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : !loading && items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon name="calendar-check-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No students found</Text>
          <Text style={styles.emptySubtitle}>
            No attendance records for this date. Try a different date or batch filter.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          testID="attendance-list"
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

  /* ── Navbar ─────────────────────────────────────── */
  navbar: {
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  navTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  navSubtitle: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.base,
    color: colors.text,
    paddingVertical: 8,
    marginLeft: spacing.xs,
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },

  /* ── Filter Panel ──────────────────────────────── */
  filterPanel: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterSection: {
    marginTop: spacing.sm,
  },
  filterLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  clearFilters: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  clearFiltersText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },

  /* ── Controls ──────────────────────────────────── */
  controlsSection: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },

  /* ── Content ───────────────────────────────────── */
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

  /* ── Empty State ────────────────────────────────── */
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
