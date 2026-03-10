import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import type { EventListItem, EventListFilters, EventStatus } from '../../../domain/event/event.types';
import * as eventApi from '../../../infra/event/event-api';
import { EventCard } from '../../components/event/EventCard';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { InlineError } from '../../components/ui/InlineError';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { Button } from '../../components/ui/Button';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'EventList'>;

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const STATUS_FILTERS: { label: string; value: EventStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'Ongoing', value: 'ONGOING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export function EventListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<EventStatus | undefined>(undefined);
  const [month] = useState(getCurrentMonth);
  const mountedRef = useRef(true);

  const filters: EventListFilters = useMemo(() => ({
    month,
    status: statusFilter,
  }), [month, statusFilter]);

  const fetchEvents = useCallback(async (pageNum: number, append = false) => {
    if (!append) setLoading(true);
    setError(null);
    const result = await eventApi.listEvents(filters, pageNum);
    if (!mountedRef.current) return;
    if (result.ok) {
      const { data, pagination } = result.value;
      setItems((prev) => append ? [...prev, ...data] : data);
      setTotal(pagination.total);
      setPage(pageNum);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [filters]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEvents(1);
    }, [fetchEvents]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEvents(1);
    setRefreshing(false);
  }, [fetchEvents]);

  const onEndReached = useCallback(() => {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    fetchEvents(page + 1, true);
  }, [loadingMore, items.length, total, page, fetchEvents]);

  const handleEventPress = useCallback((event: EventListItem) => {
    navigation.navigate('EventDetail', { eventId: event.id });
  }, [navigation]);

  const handleAdd = useCallback(() => {
    navigation.navigate('AddEvent');
  }, [navigation]);

  const renderItem = useCallback(({ item }: { item: EventListItem }) => (
    <EventCard event={item} onPress={() => handleEventPress(item)} />
  ), [handleEventPress]);

  const keyExtractor = useCallback((item: EventListItem) => item.id, []);

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
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.value)}
          >
            <Text style={[styles.filterText, statusFilter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <InlineError message={error} onRetry={() => fetchEvents(1)} />}

      {loading && !refreshing ? (
        <View style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : !loading && items.length === 0 ? (
        <EmptyState message="No events scheduled. Create your first event to get started." />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          testID="event-list"
        />
      )}

      <View style={styles.addButtonContainer}>
        <Button title="Add Event" onPress={handleAdd} testID="add-event-button" />
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  filterTextActive: {
    color: colors.white,
  },
  skeletons: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: 80,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  addButtonContainer: {
    position: 'absolute',
    bottom: spacing.base,
    left: spacing.base,
    right: spacing.base,
  },
});
