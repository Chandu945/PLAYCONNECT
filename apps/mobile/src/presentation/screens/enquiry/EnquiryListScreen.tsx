import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import type { EnquiryListItem, EnquiryStatus } from '../../../domain/enquiry/enquiry.types';
import { useEnquiries } from '../../../application/enquiry/use-enquiries';
import * as enquiryApi from '../../../infra/enquiry/enquiry-api';
import { getTodayIST } from '../../../domain/common/date-utils';
import { Screen } from '../../components/ui/Screen';
import { InlineError } from '../../components/ui/InlineError';
import { spacing, fontSizes, fontWeights, radius, listDefaults } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'EnquiryList'>;
type Route = RouteProp<MoreStackParamList, 'EnquiryList'>;

const FILTER_TABS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'TODAY', label: 'Today Follow Up' },
];

export function EnquiryListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();

  const initialFilter = route.params?.filter ?? 'ALL';
  const [activeTab, setActiveTab] = useState(initialFilter);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status: EnquiryStatus | undefined =
    activeTab === 'ACTIVE' ? 'ACTIVE' : activeTab === 'CLOSED' ? 'CLOSED' : undefined;
  const followUpToday = activeTab === 'TODAY';

  const stableApi = useMemo(() => enquiryApi, []);
  const { items, loading, loadingMore, error, hasMore, refetch, fetchMore } = useEnquiries(
    stableApi,
    status,
    debouncedSearch || undefined,
    followUpToday || undefined,
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

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(text.trim());
    }, 300);
  }, []);

  const isOverdue = useCallback((dateStr: string | null): boolean => {
    if (!dateStr) return false;
    return dateStr < getTodayIST();
  }, []);

  const renderItem = ({ item }: { item: EnquiryListItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('EnquiryDetail', { enquiryId: item.id })}
      testID={`enquiry-item-${item.id}`}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.prospectName}>{item.prospectName}</Text>
        <View style={[styles.statusBadge, item.status === 'ACTIVE' ? styles.activeBadge : styles.closedBadge]}>
          <Text style={[styles.statusText, item.status === 'ACTIVE' ? styles.activeText : styles.closedText]}>
            {item.status}
          </Text>
        </View>
      </View>
      <Text style={styles.mobileNumber}>{item.mobileNumber}</Text>
      {item.interestedIn && <Text style={styles.interestedIn}>{item.interestedIn}</Text>}
      <View style={styles.cardFooter}>
        {item.source && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText}>{item.source.replace('_', ' ')}</Text>
          </View>
        )}
        {item.nextFollowUpDate && (
          <Text style={[styles.followUpDate, isOverdue(item.nextFollowUpDate) && styles.overdueText]}>
            Follow-up: {new Date(item.nextFollowUpDate).toLocaleDateString('en-IN')}
            {isOverdue(item.nextFollowUpDate) ? ' (Overdue)' : ''}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <Screen>
      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={handleSearch}
          placeholder="Search by name or phone..."
          testID="enquiry-search"
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterChip, activeTab === tab.key && styles.filterChipActive]}
            onPress={() => setActiveTab(tab.key)}
            testID={`filter-${tab.key}`}
          >
            <Text style={[styles.filterChipText, activeTab === tab.key && styles.filterChipTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <InlineError message={error.message} onRetry={refetch} />}

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No enquiries found</Text>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.loader} /> : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        onEndReached={hasMore ? fetchMore : undefined}
        onEndReachedThreshold={0.3}
        testID="enquiry-list"
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddEnquiry')}
        testID="add-enquiry-fab"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSizes.base,
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.base,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: listDefaults.contentPaddingBottom,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prospectName: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  activeBadge: {
    backgroundColor: colors.successBg,
  },
  closedBadge: {
    backgroundColor: colors.bgSubtle,
  },
  statusText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  activeText: {
    color: colors.successText,
  },
  closedText: {
    color: colors.textSecondary,
  },
  mobileNumber: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  interestedIn: {
    fontSize: fontSizes.sm,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sourceBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  sourceText: {
    fontSize: fontSizes.xs,
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
  followUpDate: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  overdueText: {
    color: colors.danger,
    fontWeight: fontWeights.medium,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    marginTop: spacing['2xl'],
  },
  loader: {
    padding: spacing.base,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: fontSizes['3xl'],
    color: colors.white,
    lineHeight: 28,
  },
});
