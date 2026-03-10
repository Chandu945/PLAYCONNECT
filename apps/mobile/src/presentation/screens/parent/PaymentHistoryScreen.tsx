import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getPaymentHistoryUseCase } from '../../../application/parent/use-cases/get-payment-history.usecase';
import { parentApi } from '../../../infra/parent/parent-api';
import type { PaymentHistoryItem } from '../../../domain/parent/parent.types';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { formatMonthShort, formatCurrency, formatDate } from '../../utils/format';
import { useTheme } from '../../context/ThemeContext';

function getSourceConfig(source: string, colors: Colors) {
  switch (source) {
    case 'PARENT_ONLINE':
      return { label: 'Online', icon: 'cellphone', color: colors.primary, bg: colors.primarySoft };
    case 'OWNER_DIRECT':
      return { label: 'Cash', icon: 'cash', color: colors.success, bg: colors.successBg };
    case 'STAFF_APPROVED':
      return { label: 'Staff', icon: 'account-check', color: colors.warning, bg: colors.warningBg };
    default:
      return { label: source, icon: 'help-circle-outline', color: colors.textSecondary, bg: colors.bgSubtle };
  }
}

export function PaymentHistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setError(null);
    const result = await getPaymentHistoryUseCase({ parentApi });
    if (!mountedRef.current) return;
    if (result.ok) {
      setItems(result.value);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const totalPaid = items.reduce((sum, item) => sum + item.amount, 0);

  const renderItem = useCallback(({ item }: { item: PaymentHistoryItem }) => {
    const src = getSourceConfig(item.source, colors);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <View style={[styles.sourceIcon, { backgroundColor: src.bg }]}>
              {/* @ts-expect-error react-native-vector-icons types */}
              <Icon name={src.icon} size={18} color={src.color} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.studentName} numberOfLines={1}>
                {item.studentName}
              </Text>
              <Text style={styles.monthText}>{formatMonthShort(item.monthKey)}</Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
            <View style={[styles.sourceBadge, { backgroundColor: src.bg }]}>
              <Text style={[styles.sourceText, { color: src.color }]}>{src.label}</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.detailItem}>
            {/* @ts-expect-error react-native-vector-icons types */}
            <Icon name="pound" size={12} color={colors.textDisabled} />
            <Text style={styles.detailText}>{item.receiptNumber}</Text>
          </View>
          <View style={styles.detailItem}>
            {/* @ts-expect-error react-native-vector-icons types */}
            <Icon name="calendar-outline" size={12} color={colors.textDisabled} />
            <Text style={styles.detailText}>{formatDate(item.paidAt)}</Text>
          </View>
        </View>
      </View>
    );
  }, [colors, styles]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading payments...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        {/* @ts-expect-error react-native-vector-icons types */}
        <Icon name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={load}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.receiptNumber}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
      ListHeaderComponent={
        items.length > 0 ? (
          <View style={styles.summaryCard}>
            {/* @ts-expect-error react-native-vector-icons types */}
            <Icon name="check-decagram" size={24} color={colors.success} />
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Total Paid</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalPaid)}</Text>
            </View>
            <View style={styles.summaryCount}>
              <Text style={styles.summaryCountValue}>{items.length}</Text>
              <Text style={styles.summaryCountLabel}>payments</Text>
            </View>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="receipt" size={64} color={colors.textDisabled} />
          <Text style={styles.emptyTitle}>No Payments Yet</Text>
          <Text style={styles.emptySubtitle}>
            Your payment history will appear here once you make a payment
          </Text>
        </View>
      }
    />
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  list: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  summaryInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  summaryLabel: {
    fontSize: fontSizes.sm,
    color: colors.successText,
  },
  summaryValue: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.successText,
  },
  summaryCount: {
    alignItems: 'center',
  },
  summaryCountValue: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.successText,
  },
  summaryCountLabel: {
    fontSize: fontSizes.xs,
    color: colors.successText,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  monthText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  sourceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.full,
    marginTop: 2,
  },
  sourceText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailText: {
    fontSize: fontSizes.xs,
    color: colors.textDisabled,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.md,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.base,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },
  retryText: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.base,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.base,
  },
  emptySubtitle: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    maxWidth: 260,
  },
});
