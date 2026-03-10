import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import type { StaffStackParamList } from '../../navigation/StaffStack';
import type { AppError } from '../../../domain/common/errors';
import type { MonthlyStaffSummaryItem } from '../../../domain/staff-attendance/staff-attendance.types';
import { getStaffMonthlySummaryUseCase } from '../../../application/staff-attendance/use-cases/get-staff-monthly-summary.usecase';
import { getStaffMonthlySummary } from '../../../infra/staff-attendance/staff-attendance-api';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Route = RouteProp<StaffStackParamList, 'StaffAttendanceMonthlySummary'>;

const summaryApi = { getStaffMonthlySummary };
const PAGE_SIZE = 50;

export function StaffAttendanceMonthlySummaryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Route>();
  const month = route.params?.month ?? '';

  const [items, setItems] = useState<MonthlyStaffSummaryItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const result = await getStaffMonthlySummaryUseCase(
        { staffAttendanceApi: summaryApi },
        month,
        targetPage,
        PAGE_SIZE,
      );

      if (!mountedRef.current) return;

      if (result.ok) {
        if (append) {
          setItems((prev) => [...prev, ...result.value.items]);
        } else {
          setItems(result.value.items);
        }
        setPage(targetPage);
        setHasMore(targetPage < result.value.meta.totalPages);
      } else {
        setError(result.error);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [month],
  );

  const fetchMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      load(page + 1, true);
    }
  }, [loadingMore, hasMore, page, load]);

  useEffect(() => {
    mountedRef.current = true;
    load(1, false);
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(1, false);
    setRefreshing(false);
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: MonthlyStaffSummaryItem }) => (
      <View
        style={styles.row}
        testID={`staff-summary-row-${item.staffUserId}`}
      >
        <Text style={styles.name} numberOfLines={1}>
          {item.fullName}
        </Text>
        <View style={styles.counts}>
          <Text style={styles.presentCount}>{item.presentCount}P</Text>
          <Text style={styles.absentCountText}>{item.absentCount}A</Text>
        </View>
      </View>
    ),
    [],
  );

  const keyExtractor = useCallback(
    (item: MonthlyStaffSummaryItem) => item.staffUserId,
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
      <Text style={styles.monthLabel}>{month}</Text>

      {error && <InlineError message={error.message} onRetry={() => load(1, false)} />}

      {loading && !refreshing ? (
        <View style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : items.length === 0 ? (
        <EmptyState message="No staff attendance data" />
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
          testID="staff-monthly-summary-list"
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
  monthLabel: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  skeletons: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  name: {
    flex: 1,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  counts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  presentCount: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.success,
  },
  absentCountText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.danger,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
});
