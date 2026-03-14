import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { StudentsStackParamList } from '../../navigation/StudentsStack';
import type {
  StudentStatus,
  FeeFilter,
  StudentListItem,
  StudentListFilters,
} from '../../../domain/student/student.types';
import { useStudents } from '../../../application/student/use-students';
import { listStudents } from '../../../infra/student/student-api';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { StudentRow } from '../../components/students/StudentRow';
import { StudentActionMenu } from '../../components/student/StudentActionMenu';
import { BatchFilterBar } from '../../components/attendance/BatchFilterBar';
import { ActiveFilterBar } from '../../components/ui/ActiveFilterBar';
import type { ActiveFilter } from '../../components/ui/ActiveFilterBar';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { animateLayout } from '../../utils/layout-animation';
import { getCurrentMonthIST } from '../../../domain/common/date-utils';

type Nav = NativeStackNavigationProp<StudentsStackParamList, 'StudentsList'>;

const studentsApi = { listStudents };

function getCurrentMonth(): string {
  return getCurrentMonthIST();
}

const STATUS_OPTIONS: { label: string; value: StudentStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Left', value: 'LEFT' },
];

const FEE_OPTIONS: { label: string; value: FeeFilter | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Due', value: 'DUE' },
  { label: 'Paid', value: 'PAID' },
];

export function StudentsListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentStatus | undefined>(undefined);
  const [feeFilter, setFeeFilter] = useState<FeeFilter | undefined>(undefined);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchName, setSelectedBatchName] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [month] = useState(getCurrentMonth);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMenuStudent, setActionMenuStudent] = useState<StudentListItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const fabScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [searchText]);

  const filters: StudentListFilters = useMemo(
    () => ({
      status: statusFilter,
      search: debouncedSearch || undefined,
      feeFilter: feeFilter,
      month: feeFilter && feeFilter !== 'ALL' ? month : undefined,
      batchId: selectedBatchId ?? undefined,
    }),
    [statusFilter, debouncedSearch, feeFilter, month, selectedBatchId],
  );

  const { items, loading, loadingMore, error, refetch, fetchMore } = useStudents(
    filters,
    studentsApi,
  );

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

  const activeFilterCount =
    (statusFilter ? 1 : 0) + (feeFilter ? 1 : 0) + (selectedBatchId ? 1 : 0);

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const arr: ActiveFilter[] = [];
    if (statusFilter) {
      const label = STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter;
      arr.push({
        key: 'status',
        label: 'Status',
        value: label,
        onRemove: () => setStatusFilter(undefined),
      });
    }
    if (feeFilter) {
      const label = FEE_OPTIONS.find((o) => o.value === feeFilter)?.label ?? feeFilter;
      arr.push({
        key: 'fee',
        label: 'Fee',
        value: label,
        onRemove: () => setFeeFilter(undefined),
      });
    }
    if (selectedBatchId) {
      arr.push({
        key: 'batch',
        label: 'Batch',
        value: selectedBatchName ?? 'Selected',
        onRemove: () => {
          setSelectedBatchId(null);
          setSelectedBatchName(null);
        },
      });
    }
    return arr;
  }, [statusFilter, feeFilter, selectedBatchId, selectedBatchName]);

  const clearAllFilters = useCallback(() => {
    setStatusFilter(undefined);
    setFeeFilter(undefined);
    setSelectedBatchId(null);
    setSelectedBatchName(null);
  }, []);

  const handleBatchChange = useCallback((id: string | null, name?: string) => {
    setSelectedBatchId(id);
    setSelectedBatchName(name ?? null);
  }, []);

  const toggleFilters = useCallback(() => {
    animateLayout();
    setShowFilters((v) => !v);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleRowPress = useCallback(
    (student: StudentListItem) => {
      navigation.navigate('StudentDetail', { student });
    },
    [navigation],
  );

  const handleAdd = useCallback(() => {
    navigation.navigate('StudentForm', { mode: 'create' });
  }, [navigation]);

  const handleLongPress = useCallback((student: StudentListItem) => {
    setActionMenuStudent(student);
  }, []);

  const openSearch = useCallback(() => {
    setSearchActive(true);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchActive(false);
    setSearchText('');
    setDebouncedSearch('');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: StudentListItem }) => (
      <StudentRow
        student={item}
        onPress={() => handleRowPress(item)}
        onLongPress={() => handleLongPress(item)}
      />
    ),
    [handleRowPress, handleLongPress],
  );

  const keyExtractor = useCallback((item: StudentListItem) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, colors, styles]);

  const handleFabPressIn = () => {
    Animated.spring(fabScale, { toValue: 0.9, useNativeDriver: true }).start();
  };
  const handleFabPressOut = () => {
    Animated.spring(fabScale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  };

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
              testID="search-input"
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
              <Text style={styles.navTitle}>Students</Text>
              <Text style={styles.navSubtitle}>
                {items.length} Total Students found
              </Text>
            </View>
            <View style={styles.navActions}>
              <TouchableOpacity onPress={openSearch} style={styles.navBtn} testID="search-button" accessibilityLabel="Search" accessibilityRole="button">
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="magnify" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleFilters}
                style={[styles.navBtn, showFilters && styles.navBtnActive]}
                testID="filter-button"
                accessibilityLabel="Toggle filters"
                accessibilityRole="button"
              >
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon
                  name={showFilters ? 'filter-variant-remove' : 'filter-variant'}
                  size={22}
                  color={showFilters ? colors.primary : colors.text}
                />
                {activeFilterCount > 0 && !showFilters && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Active Filter Pills (visible when panel closed) ── */}
      {!showFilters && <ActiveFilterBar filters={activeFilters} onClearAll={clearAllFilters} />}

      {/* ── Filter Panel ──────────────────────────────── */}
      {showFilters && (
        <View style={styles.filterPanel}>
          {/* Status Filter */}
          <View style={styles.filterCard}>
            <View style={styles.filterCardHeader}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="account-check-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.filterCardTitle}>Status</Text>
            </View>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((opt) => {
                const selected = statusFilter === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setStatusFilter(opt.value)}
                    testID={`status-chip-${opt.label.toLowerCase()}`}
                  >
                    {selected && (
                      // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
                      <Icon name="check" size={14} color={colors.primary} />
                    )}
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Fee Status Filter */}
          <View style={styles.filterCard}>
            <View style={styles.filterCardHeader}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="currency-inr" size={15} color={colors.textSecondary} />
              <Text style={styles.filterCardTitle}>Fee Status</Text>
            </View>
            <View style={styles.chipRow}>
              {FEE_OPTIONS.map((opt) => {
                const selected = feeFilter === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => setFeeFilter(opt.value)}
                    testID={`fee-chip-${opt.label.toLowerCase()}`}
                  >
                    {selected && (
                      // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
                      <Icon name="check" size={14} color={colors.primary} />
                    )}
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Batch Filter */}
          <View style={styles.filterCard}>
            <View style={styles.filterCardHeader}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="account-group-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.filterCardTitle}>Batch</Text>
            </View>
            <BatchFilterBar selectedBatchId={selectedBatchId} onChange={handleBatchChange} />
          </View>

          {/* Clear All */}
          {activeFilterCount > 0 && (
            <TouchableOpacity style={styles.clearFilters} onPress={clearAllFilters}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="filter-remove-outline" size={16} color={colors.danger} />
              <Text style={styles.clearFiltersText}>Clear All Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Content ───────────────────────────────────── */}
      {error && <InlineError message={error.message} onRetry={refetch} />}

      {loading && !refreshing ? (
        <View testID="skeleton-container" style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : !loading && items.length === 0 ? (
        <EmptyState
          variant={activeFilterCount > 0 || debouncedSearch ? 'noResults' : 'empty'}
          icon={activeFilterCount > 0 || debouncedSearch ? undefined : 'account-search-outline'}
          message={activeFilterCount > 0 || debouncedSearch ? 'No matching students' : 'No students enrolled yet.'}
          subtitle={activeFilterCount > 0 || debouncedSearch ? undefined : 'There are currently no students in the system. Add new students to see them listed here.'}
        />
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
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          testID="students-list"
        />
      )}

      {/* ── FAB ───────────────────────────────────────── */}
      <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity
          onPress={handleAdd}
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          activeOpacity={0.8}
          style={styles.fabTouchable}
          testID="add-student-button"
        >
          {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
          <Icon name="plus" size={28} color={colors.white} />
        </TouchableOpacity>
      </Animated.View>

      {actionMenuStudent && (
        <StudentActionMenu
          visible={!!actionMenuStudent}
          student={actionMenuStudent}
          onClose={() => setActionMenuStudent(null)}
          onEdit={() => {
            if (actionMenuStudent) {
              navigation.navigate('StudentForm', { mode: 'edit', student: actionMenuStudent });
            }
          }}
          onAssignBatch={() => {
            if (actionMenuStudent) {
              navigation.navigate('StudentForm', { mode: 'edit', student: actionMenuStudent });
            }
          }}
          onDeleted={refetch}
          onStatusChanged={refetch}
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
  navBtnActive: {
    backgroundColor: colors.primarySoft,
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
    gap: spacing.sm,
  },
  filterCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  filterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterCardTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 5,
  },
  chipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textMedium,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  clearFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    gap: spacing.xs,
  },
  clearFiltersText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },

  /* ── Content ───────────────────────────────────── */
  skeletons: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },

  /* ── FAB ────────────────────────────────────────── */
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
  },
  fabTouchable: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
