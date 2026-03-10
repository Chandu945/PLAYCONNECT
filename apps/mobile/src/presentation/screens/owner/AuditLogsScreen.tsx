import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useAuditLogs } from '../../../application/audit/use-audit-logs';
import { auditApi } from '../../../infra/audit/audit-api';
import { AuditLogRow } from '../../components/audit/AuditLogRow';
import { AuditFiltersPanel } from '../../components/audit/AuditFilters';
import { EmptyState } from '../../components/ui/EmptyState';
import type { AuditLogItem } from '../../../domain/audit/audit.types';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

export function AuditLogsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  if (!isOwner) {
    return (
      <View style={styles.center} testID="audit-forbidden">
        <Text style={styles.forbiddenText}>Only the owner can view audit logs.</Text>
      </View>
    );
  }

  return <AuditLogsContent />;
}

function AuditLogsContent() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    filters,
    setFilters,
    applyFilters,
    clearFilters,
    fetchMore,
    refetch,
  } = useAuditLogs(auditApi);

  const [showFilters, setShowFilters] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: AuditLogItem }) => (
      <AuditLogRow item={item} testID={`audit-row-${item.id}`} />
    ),
    [],
  );

  const renderFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.footer} testID="loading-more">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (hasMore && items.length > 0) {
      return (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={fetchMore} testID="load-more-btn">
          <Text style={styles.loadMoreText}>Load More</Text>
        </TouchableOpacity>
      );
    }
    return null;
  }, [loadingMore, hasMore, items.length, fetchMore, colors, styles]);

  return (
    <View style={styles.screen} testID="audit-logs-screen">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Audit Logs</Text>
        <TouchableOpacity
          onPress={() => setShowFilters((v) => !v)}
          testID="toggle-filters"
        >
          <Text style={styles.filterToggle}>{showFilters ? 'Hide Filters' : 'Show Filters'}</Text>
        </TouchableOpacity>
      </View>

      {showFilters && (
        <AuditFiltersPanel
          filters={filters}
          onChange={setFilters}
          onApply={() => { applyFilters(); setShowFilters(false); }}
          onClear={clearFilters}
        />
      )}

      {error && (
        <View style={styles.errorRow} testID="audit-error">
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity onPress={refetch} testID="audit-retry">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.center} testID="audit-loading">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState message="No audit logs found" />}
          ListFooterComponent={renderFooter}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          testID="audit-list"
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  filterToggle: {
    fontSize: fontSizes.base,
    color: colors.primary,
    fontWeight: fontWeights.medium,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  forbiddenText: {
    fontSize: fontSizes.lg,
    color: colors.danger,
    textAlign: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: fontSizes.base,
    color: colors.danger,
  },
  retryText: {
    fontSize: fontSizes.base,
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  footer: {
    padding: spacing.base,
    alignItems: 'center',
  },
  loadMoreBtn: {
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  loadMoreText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
