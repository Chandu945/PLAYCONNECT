import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { FeesStackParamList } from '../../navigation/FeesStack';
import { useAuth } from '../../context/AuthContext';
import { useFees } from '../../../application/fees/use-fees';
import { listUnpaidDues, listPaidDues } from '../../../infra/fees/fees-api';
import { listStudents } from '../../../infra/student/student-api';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { MonthPickerRow } from '../../components/fees/MonthPickerRow';
import { BatchFilterBar } from '../../components/attendance/BatchFilterBar';
import { ActiveFilterBar } from '../../components/ui/ActiveFilterBar';
import type { ActiveFilter } from '../../components/ui/ActiveFilterBar';
import { listBatchStudents } from '../../../infra/batch/batch-api';
import { UnpaidDuesScreen } from './UnpaidDuesScreen';
import { PaidFeesScreen } from './PaidFeesScreen';
import { PendingApprovalsScreen } from '../owner/PendingApprovalsScreen';
import { MyPaymentRequestsScreen } from '../staff/MyPaymentRequestsScreen';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Nav = NativeStackNavigationProp<FeesStackParamList, 'FeesHome'>;

const feesApiRef = { listUnpaidDues, listPaidDues };

function addMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function FeesHomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const segments = isOwner ? ['Unpaid', 'Paid', 'Approvals'] : ['Unpaid', 'Paid', 'My Requests'];

  const [selectedSegment, setSelectedSegment] = useState(0);
  const { unpaidItems, paidItems, loading, error, month, setMonth, refetch } = useFees(feesApiRef);

  const [studentNameMap, setStudentNameMap] = useState<Record<string, string>>({});
  const [searchActive, setSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchName, setSelectedBatchName] = useState<string | null>(null);
  const [batchStudentIds, setBatchStudentIds] = useState<Set<string> | null>(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const loadStudentNames = useCallback(async () => {
    const result = await listStudents({}, 1, 100);
    if (!mountedRef.current) return;
    if (result.ok) {
      const map: Record<string, string> = {};
      for (const s of result.value.data) {
        map[s.id] = s.fullName;
      }
      setStudentNameMap(map);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Refresh fees + student names each time screen gains focus
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        loadStudentNames();
        return;
      }
      refetch();
      loadStudentNames();
    }, [refetch, loadStudentNames]),
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

  useEffect(() => {
    if (!selectedBatchId) {
      setBatchStudentIds(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const result = await listBatchStudents(selectedBatchId!, 1, 100);
      if (cancelled) return;
      if (result.ok) {
        const ids = new Set(result.value.data.map((s: { id: string }) => s.id));
        setBatchStudentIds(ids);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedBatchId]);

  const filteredUnpaidItems = useMemo(() => {
    let items = unpaidItems;
    if (batchStudentIds) {
      items = items.filter((item) => batchStudentIds.has(item.studentId));
    }
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      items = items.filter((item) => {
        const name = studentNameMap[item.studentId];
        return name && name.toLowerCase().includes(searchLower);
      });
    }
    return items;
  }, [unpaidItems, debouncedSearch, studentNameMap, batchStudentIds]);

  const filteredPaidItems = useMemo(() => {
    let items = paidItems;
    if (batchStudentIds) {
      items = items.filter((item) => batchStudentIds.has(item.studentId));
    }
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      items = items.filter((item) => {
        const name = studentNameMap[item.studentId];
        return name && name.toLowerCase().includes(searchLower);
      });
    }
    return items;
  }, [paidItems, debouncedSearch, studentNameMap, batchStudentIds]);

  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const arr: ActiveFilter[] = [];
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
  }, [selectedBatchId, selectedBatchName]);

  const clearAllFilters = useCallback(() => {
    setSelectedBatchId(null);
    setSelectedBatchName(null);
  }, []);

  const handleBatchChange = useCallback((id: string | null, name?: string) => {
    setSelectedBatchId(id);
    setSelectedBatchName(name ?? null);
  }, []);

  const toggleFilters = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters((v) => !v);
  }, []);

  const goToPrev = useCallback(() => {
    setMonth(addMonths(month, -1));
  }, [month, setMonth]);

  const goToNext = useCallback(() => {
    setMonth(addMonths(month, 1));
  }, [month, setMonth]);

  const handleFeeRowPress = useCallback(
    (studentId: string) => {
      navigation.navigate('StudentFeeDetail', {
        studentId,
        studentName: studentNameMap[studentId] ?? 'Student',
      });
    },
    [navigation, studentNameMap],
  );

  const openSearch = useCallback(() => {
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchActive(false);
    setSearchText('');
    setDebouncedSearch('');
  }, []);

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
              placeholder="Search by student name"
              placeholderTextColor={colors.textDisabled}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
              testID="fees-search-input"
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
              <Text style={styles.navTitle}>Fees</Text>
              <Text style={styles.navSubtitle}>{formatMonthLabel(month)}</Text>
            </View>
            <View style={styles.navActions}>
              <TouchableOpacity onPress={openSearch} style={styles.navBtn} testID="search-button">
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon name="magnify" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleFilters}
                style={[styles.navBtn, showFilters && styles.navBtnActive]}
                testID="filter-button"
              >
                {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                <Icon
                  name={showFilters ? 'filter-variant-remove' : 'filter-variant'}
                  size={22}
                  color={showFilters ? colors.primary : colors.text}
                />
                {selectedBatchId !== null && !showFilters && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>1</Text>
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
          <MonthPickerRow month={month} onPrevious={goToPrev} onNext={goToNext} />
          <SegmentedControl
            segments={segments}
            selectedIndex={selectedSegment}
            onSelect={setSelectedSegment}
            testID="fees-segments"
          />
          <View style={styles.filterCard}>
            <View style={styles.filterCardHeader}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="account-group-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.filterCardTitle}>Batch</Text>
            </View>
            <BatchFilterBar selectedBatchId={selectedBatchId} onChange={handleBatchChange} />
          </View>
          {selectedBatchId !== null && (
            <TouchableOpacity style={styles.clearFilters} onPress={clearAllFilters}>
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="filter-remove-outline" size={16} color={colors.danger} />
              <Text style={styles.clearFiltersText}>Clear Batch Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Controls (always visible when filter panel is closed) ── */}
      {!showFilters && (
        <View style={styles.controlsSection}>
          <MonthPickerRow month={month} onPrevious={goToPrev} onNext={goToNext} />
          <SegmentedControl
            segments={segments}
            selectedIndex={selectedSegment}
            onSelect={setSelectedSegment}
            testID="fees-segments"
          />
        </View>
      )}

      {selectedSegment === 0 && (
        <UnpaidDuesScreen
          items={filteredUnpaidItems}
          loading={loading}
          error={error}
          onRetry={refetch}
          onRowPress={handleFeeRowPress}
          isOwner={isOwner}
          month={month}
          onMarkPaidSuccess={refetch}
          studentNameMap={studentNameMap}
        />
      )}
      {selectedSegment === 1 && (
        <PaidFeesScreen
          items={filteredPaidItems}
          loading={loading}
          error={error}
          onRetry={refetch}
          onRowPress={handleFeeRowPress}
          studentNameMap={studentNameMap}
        />
      )}
      {selectedSegment === 2 &&
        (isOwner ? (
          <PendingApprovalsScreen onActionComplete={refetch} />
        ) : (
          <MyPaymentRequestsScreen />
        ))}
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

  /* ── Controls ──────────────────────────────────── */
  controlsSection: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
});
