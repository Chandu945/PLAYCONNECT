import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import type { ExpenseItem, ExpenseCategory } from '../../../domain/expense/expense.types';
import { useExpenses } from '../../../application/expense/use-expenses';
import { getExpenseSummaryUseCase } from '../../../application/expense/use-cases/get-expense-summary.usecase';
import { deleteExpenseUseCase } from '../../../application/expense/use-cases/delete-expense.usecase';
import * as expenseApi from '../../../infra/expense/expense-api';
import { expenseCategoryListSchema } from '../../../domain/expense/expense.schemas';
import { Screen } from '../../components/ui/Screen';
import { InlineError } from '../../components/ui/InlineError';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import type { ExpenseSummary } from '../../../domain/expense/expense.types';
import { useTheme } from '../../context/ThemeContext';
import { getCurrentMonthIST } from '../../../domain/common/date-utils';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ExpensesHome'>;

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${names[parseInt(m!, 10) - 1]} ${y}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

function currentMonth(): string {
  return getCurrentMonthIST();
}

function formatCurrency(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN')}`;
}

export function ExpensesHomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const [month, setMonth] = useState(currentMonth());
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const stableApi = useMemo(() => expenseApi, []);

  // Dynamic categories
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const loadCategories = useCallback(async () => {
    const result = await expenseApi.listCategories();
    if (result.ok) {
      const parsed = expenseCategoryListSchema.safeParse(result.value);
      if (parsed.success) {
        setCategories(parsed.data.categories);
      }
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const { items, loading, loadingMore, error, hasMore, refetch, fetchMore } = useExpenses(
    month,
    stableApi,
    categoryFilter,
  );

  // Summary
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const mountedRef = useRef(true);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    const result = await getExpenseSummaryUseCase({ expenseApi: stableApi }, month);
    if (!mountedRef.current) return;
    if (result.ok) {
      setSummary(result.value);
    }
    setSummaryLoading(false);
  }, [month, stableApi]);

  useEffect(() => {
    mountedRef.current = true;
    loadSummary();
    return () => {
      mountedRef.current = false;
    };
  }, [loadSummary]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadSummary(), loadCategories()]);
    setRefreshing(false);
  };

  const handleDelete = (item: ExpenseItem) => {
    Alert.alert(
      'Delete Expense',
      `Delete ${item.categoryName} - ${formatCurrency(item.amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteExpenseUseCase({ expenseApi: stableApi }, item.id);
            if (result.ok) {
              refetch();
              loadSummary();
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: ExpenseItem }) => (
    <TouchableOpacity
      style={styles.expenseCard}
      onPress={() => navigation.navigate('ExpenseForm', { mode: 'edit', expense: item })}
      onLongPress={() => handleDelete(item)}
      testID={`expense-item-${item.id}`}
    >
      <View style={styles.cardRow}>
        <View style={styles.cardLeft}>
          <Text style={styles.categoryLabel}>{item.categoryName}</Text>
          <Text style={styles.dateLabel}>{item.date}</Text>
        </View>
        <Text style={styles.amountLabel}>{formatCurrency(item.amount)}</Text>
      </View>
      {item.notes ? <Text style={styles.notesLabel}>{item.notes}</Text> : null}
    </TouchableOpacity>
  );

  const ListHeader = (
    <View>
      {/* Month Picker */}
      <View style={styles.monthPicker}>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} testID="prev-month">
          <Text style={styles.arrow}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{formatMonth(month)}</Text>
        <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} testID="next-month">
          <Text style={styles.arrow}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      {summary && !summaryLoading && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTotal}>Total: {formatCurrency(summary.totalAmount)}</Text>
          {summary.categories.map((cat) => (
            <View key={cat.category} style={styles.summaryRow}>
              <Text style={styles.summaryCatLabel}>{cat.category}</Text>
              <Text style={styles.summaryCatAmount}>{formatCurrency(cat.total)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Category Filter */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, !categoryFilter && styles.filterChipActive]}
          onPress={() => setCategoryFilter(undefined)}
        >
          <Text style={[styles.filterChipText, !categoryFilter && styles.filterChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.filterChip, categoryFilter === cat.id && styles.filterChipActive]}
            onPress={() => setCategoryFilter(categoryFilter === cat.id ? undefined : cat.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                categoryFilter === cat.id && styles.filterChipTextActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <InlineError message={error.message} onRetry={refetch} />}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No expenses for this month</Text>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.loader} /> : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        onEndReached={hasMore ? fetchMore : undefined}
        onEndReachedThreshold={0.3}
        testID="expenses-list"
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ExpenseForm', { mode: 'create' })}
        testID="add-expense-fab"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  arrow: {
    fontSize: fontSizes['2xl'],
    color: colors.primary,
    paddingHorizontal: spacing.base,
  },
  monthLabel: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    minWidth: 160,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  summaryTotal: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  summaryCatLabel: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  summaryCatAmount: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.base,
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
  expenseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.medium,
    color: colors.text,
  },
  dateLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  amountLabel: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },
  notesLabel: {
    fontSize: fontSizes.sm,
    color: colors.textLight,
    marginTop: spacing.sm,
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
