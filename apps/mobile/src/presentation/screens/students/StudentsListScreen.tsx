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
import { StudentRow } from '../../components/students/StudentRow';
import { StudentActionMenu } from '../../components/student/StudentActionMenu';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<StudentsStackParamList, 'StudentsList'>;

const studentsApi = { listStudents };

function getCurrentMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
    }),
    [statusFilter, debouncedSearch, feeFilter, month],
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
    (statusFilter ? 1 : 0) + (feeFilter ? 1 : 0);

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
                {activeFilterCount > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
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
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Status</Text>
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
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Fee Status</Text>
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
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={styles.clearFilters}
              onPress={() => {
                setStatusFilter(undefined);
                setFeeFilter(undefined);
              }}
            >
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
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
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon name="account-search-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No students enrolled yet.</Text>
          <Text style={styles.emptySubtitle}>
            There are currently no students in the system. Add new students to see them listed here.
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
    marginBottom: spacing.md,
  },
  filterLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textMedium,
  },
  chipTextSelected: {
    color: colors.white,
  },
  clearFilters: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  clearFiltersText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
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
