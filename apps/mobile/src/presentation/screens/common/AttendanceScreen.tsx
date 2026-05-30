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
  Keyboard} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { crossAlert } from '../../utils/crossPlatformAlert';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppIcon } from '../../components/ui/AppIcon';
import type { AttendanceStackParamList } from '../../navigation/AttendanceStack';
import type { DailyAttendanceItem } from '../../../domain/attendance/attendance.types';
import { useAttendance, getTodayIST } from '../../../application/attendance/use-attendance';
import { getDailyAttendance, markAttendance, bulkSetAbsences } from '../../../infra/attendance/attendance-api';
import { declareHoliday, removeHoliday } from '../../../infra/attendance/holidays-api';
import { declareHolidayUseCase } from '../../../application/attendance/use-cases/declare-holiday.usecase';
import { removeHolidayUseCase } from '../../../application/attendance/use-cases/remove-holiday.usecase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { DatePickerRow } from '../../components/attendance/DatePickerRow';
import { HolidayBanner } from '../../components/attendance/HolidayBanner';
import { AttendanceHeader } from '../../components/attendance/AttendanceHeader';
import { AttendanceRow } from '../../components/attendance/AttendanceRow';
import { BatchPickerSheet } from '../../components/attendance/BatchPickerSheet';
import { BatchSessionHeader } from '../../components/attendance/BatchSessionHeader';
import { SelectBatchPrompt } from '../../components/attendance/SelectBatchPrompt';
import { OffScheduleDayPrompt } from '../../components/attendance/OffScheduleDayPrompt';
import { getBatchesCached } from '../../../infra/batch/batch-cache';
import type { BatchListItem, Weekday } from '../../../domain/batch/batch.types';
import LinearGradient from 'react-native-linear-gradient';
import { spacing, fontSizes, fontWeights, radius, listDefaults, gradient } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<AttendanceStackParamList, 'AttendanceMain'>;

const attendanceApi = { getDailyAttendance, markAttendance, bulkSetAbsences };
const holidaysApiRef = { declareHoliday, removeHoliday };

// Maps JS Date.getDay() (0=Sun..6=Sat) to the contracts Weekday literal so
// we can check whether a calendar day matches the batch's schedule.
const JS_WEEKDAY_TO_LABEL: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function weekdayOf(dateStr: string): Weekday {
  const d = new Date(dateStr + 'T00:00:00');
  return JS_WEEKDAY_TO_LABEL[d.getDay()]!;
}

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
  const { showToast } = useToast();
  const isOwner = user?.role === 'OWNER';

  const [selectedDate, setSelectedDate] = useState(getTodayIST);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showBatchPicker, setShowBatchPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  // Load batches once and auto-select when there's exactly one — small academies
  // don't need to click through a picker every session.
  useEffect(() => {
    let mounted = true;
    getBatchesCached()
      .then((items) => {
        if (!mounted) return;
        setBatches(items);
        if (items.length === 1 && !selectedBatchId) {
          setSelectedBatchId(items[0]!.id);
        }
      })
      .finally(() => {
        if (mounted) setBatchesLoading(false);
      });
    return () => {
      mounted = false;
    };
    // Intentionally only runs on mount; selectedBatchId is read to avoid
    // clobbering a user's explicit choice during a fast remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

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

  // Refetch when screen regains focus (e.g., returning from daily report)
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch {
      // Handled by the hook
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const goToPrev = useCallback(() => {
    setSelectedDate((d) => addDays(d, -1));
  }, []);

  const goToNext = useCallback(() => {
    setSelectedDate((d) => {
      const next = addDays(d, 1);
      return next > getTodayIST() ? d : next;
    });
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(getTodayIST());
  }, []);

  const handleDeclareHoliday = useCallback(() => {
    crossAlert(
      'Declare Holiday',
      'This will mark this date as a holiday for all students. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Declare',
          onPress: async () => {
            setDeclaringHoliday(true);
            try {
              const result = await declareHolidayUseCase({ holidaysApi: holidaysApiRef }, selectedDate);
              if (!result.ok) {
                showToast(result.error.message, 'error');
              }
              refetch();
            } catch (e) {
              if (__DEV__) console.error('[AttendanceScreen] Declare holiday failed:', e);
              showToast('Failed to declare holiday', 'error');
            } finally {
              setDeclaringHoliday(false);
            }
          },
        },
      ],
    );
  }, [selectedDate, refetch, showToast]);

  const handleRemoveHoliday = useCallback(() => {
    crossAlert(
      'Remove Holiday',
      'This will remove the holiday status for this date and restore attendance. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingHoliday(true);
            try {
              const result = await removeHolidayUseCase({ holidaysApi: holidaysApiRef }, selectedDate);
              if (!result.ok) {
                showToast(result.error.message, 'error');
              }
              refetch();
            } catch (e) {
              if (__DEV__) console.error('[AttendanceScreen] Remove holiday failed:', e);
              showToast('Failed to remove holiday', 'error');
            } finally {
              setRemovingHoliday(false);
            }
          },
        },
      ],
    );
  }, [selectedDate, refetch, showToast]);

  const handleDailyReport = useCallback(() => {
    navigation.navigate('DailyReport', { date: selectedDate });
  }, [navigation, selectedDate]);

  const handleMonthlySummary = useCallback(() => {
    navigation.navigate('MonthlySummary', { month: getMonthFromDate(selectedDate) });
  }, [navigation, selectedDate]);

  const openSearch = useCallback(() => {
    setSearchActive(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchActive(false);
    setSearchText('');
    setDebouncedSearch('');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: DailyAttendanceItem }) => (
      <AttendanceRow
        item={item}
        onToggle={toggleStatus}
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

  const isToday = selectedDate === getTodayIST();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      {/* ── Navbar ─────────────────────────────────────── */}
      <View style={styles.navbar}>
        {searchActive ? (
          <View style={styles.searchBar}>
            <TouchableOpacity
              onPress={closeSearch}
              style={styles.navBtn}
              accessibilityLabel="Close search"
              accessibilityRole="button"
            >
              <AppIcon name="arrow-left" size={22} color={colors.text} />
            </TouchableOpacity>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search by name"
              placeholderTextColor={colors.textDisabled}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
              onSubmitEditing={() => Keyboard.dismiss()}
              autoFocus
              accessibilityLabel="Search students by name"
              testID="attendance-search-input"
            />
            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText('')}
                style={styles.navBtn}
                accessibilityLabel="Clear search text"
                accessibilityRole="button"
              >
                <AppIcon name="close" size={20} color={colors.textSecondary} />
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
              <TouchableOpacity onPress={openSearch} style={styles.navBtn} testID="search-button" accessibilityLabel="Search students" accessibilityRole="button">
                <AppIcon name="magnify" size={22} color={colors.text} />
              </TouchableOpacity>
              {/* Batch switcher lives in the session header below — only show
                  this nav affordance when there's no batch picked yet, so the
                  user always has a fast path to the picker. */}
              {!selectedBatchId && batches.length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowBatchPicker(true)}
                  style={styles.navBtn}
                  testID="open-batch-picker-button"
                  accessibilityLabel="Select batch"
                  accessibilityRole="button"
                >
                  <AppIcon name="account-group-outline" size={22} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Bottom-sheet picker for choosing (or changing) the batch. */}
      <BatchPickerSheet
        visible={showBatchPicker}
        batches={batches}
        loading={batchesLoading}
        selectedBatchId={selectedBatchId}
        selectedWeekday={weekdayOf(selectedDate)}
        isSelectedToday={isToday}
        onSelect={(batchId) => {
          setSelectedBatchId(batchId);
          setShowBatchPicker(false);
        }}
        onClose={() => setShowBatchPicker(false)}
      />

      {/* Date + actions stay visible at all times — they're independent of
          batch selection and let staff scrub the date before picking a batch. */}
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

      {/* Session header: persistent "which batch am I marking" context. */}
      {selectedBatch && (
        <BatchSessionHeader
          batchName={selectedBatch.batchName}
          startTime={selectedBatch.startTime}
          endTime={selectedBatch.endTime}
          onChange={() => setShowBatchPicker(true)}
        />
      )}

      {isHoliday && (
        <HolidayBanner
          isOwner={isOwner}
          onRemoveHoliday={handleRemoveHoliday}
          removing={removingHoliday}
        />
      )}

      {error && <InlineError message={error.message} onRetry={refetch} />}

      {!selectedBatchId ? (
        // Without a batch we have nothing to mark. Prompt explicitly rather
        // than showing a confusing student list or filter bar.
        <SelectBatchPrompt
          onSelectBatch={() => setShowBatchPicker(true)}
          loading={batchesLoading}
          noBatchesAvailable={!batchesLoading && batches.length === 0}
        />
      ) : selectedBatch &&
        selectedBatch.days.length > 0 &&
        !selectedBatch.days.includes(weekdayOf(selectedDate)) ? (
        // Block marking on a day the batch doesn't meet — prevents stray
        // (student, batch, off-day) records that would skew session math.
        <OffScheduleDayPrompt
          batchName={selectedBatch.batchName}
          selectedWeekday={weekdayOf(selectedDate)}
          scheduledDays={selectedBatch.days}
        />
      ) : loading && !refreshing ? (
        <View testID="skeleton-container" style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : !loading && items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <LinearGradient
              colors={[gradient.start, gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <AppIcon name="calendar-check-outline" size={48} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>No students in this batch</Text>
          <Text style={styles.emptySubtitle}>
            This batch has no active students on the selected date. Try another date or add students to the batch.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          removeClippedSubviews
          windowSize={11}
          maxToRenderPerBatch={5}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          testID="attendance-list"
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* ── Navbar ─────────────────────────────────────── */
  navbar: {
    backgroundColor: colors.bg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.base,
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
    width: 44,
    height: 44,
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
    paddingBottom: listDefaults.contentPaddingBottomNoFab,
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
    overflow: 'hidden',
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
