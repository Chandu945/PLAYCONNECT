import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FeesStackParamList } from '../../navigation/FeesStack';
import type { AppError } from '../../../domain/common/errors';
import type { FeeDueItem } from '../../../domain/fees/fees.types';
import { getStudentFeeDetailUseCase } from '../../../application/fees/use-cases/get-student-fee-detail.usecase';
import { ownerMarkPaidUseCase } from '../../../application/fees/use-cases/owner-mark-paid.usecase';
import { getStudentFees, markFeePaid } from '../../../infra/fees/fees-api';
import { useAuth } from '../../context/AuthContext';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { FeeDueRow } from '../../components/fees/FeeDueRow';
import { getCurrentMonthIST } from '../../../application/fees/use-fees';
import { colors, spacing } from '../../theme';

type Route = RouteProp<FeesStackParamList, 'StudentFeeDetail'>;
type Nav = NativeStackNavigationProp<FeesStackParamList, 'StudentFeeDetail'>;

const detailApi = { getStudentFees };
const markPaidApi = { markFeePaid };

function getDefaultRange(): { from: string; to: string } {
  const current = getCurrentMonthIST();
  const [y, m] = current.split('-').map(Number) as [number, number];
  const from = `${y}-01`;
  const toMonth = String(m).padStart(2, '0');
  return { from, to: `${y}-${toMonth}` };
}

export function StudentFeeDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const isStaff = user?.role === 'STAFF';
  const { studentId } = route.params;

  const [items, setItems] = useState<FeeDueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [confirmItem, setConfirmItem] = useState<FeeDueItem | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = getDefaultRange();

    const result = await getStudentFeeDetailUseCase({ feesApi: detailApi }, studentId, from, to);

    if (!mountedRef.current) return;

    if (result.ok) {
      setItems(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const handleRowPress = useCallback(
    (item: FeeDueItem) => {
      if (item.status === 'PAID') return;

      if (isOwner) {
        setConfirmItem(item);
      } else if (isStaff) {
        navigation.navigate('PaymentRequestForm', {
          studentId: item.studentId,
          monthKey: item.monthKey,
          amount: item.amount,
        });
      }
    },
    [isOwner, isStaff, navigation],
  );

  const handleMarkPaid = useCallback(async () => {
    if (!confirmItem) return;
    setMarking(true);
    setMarkError(null);

    const result = await ownerMarkPaidUseCase(
      { feesApi: markPaidApi },
      confirmItem.studentId,
      confirmItem.monthKey,
    );

    if (!mountedRef.current) return;
    setMarking(false);

    if (result.ok) {
      setConfirmItem(null);
      load();
    } else {
      setMarkError(result.error.message);
    }
  }, [confirmItem, load]);

  const renderItem = useCallback(
    ({ item }: { item: FeeDueItem }) => (
      <FeeDueRow item={item} onPress={() => handleRowPress(item)} showStudentName={false} />
    ),
    [handleRowPress],
  );

  const keyExtractor = useCallback((item: FeeDueItem) => item.id, []);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <SkeletonTile />
          <SkeletonTile />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <InlineError message={error.message} onRetry={load} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {items.length === 0 ? (
        <EmptyState message="No fee records found" />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          testID="student-fee-list"
        />
      )}

      <ConfirmSheet
        visible={confirmItem !== null}
        title="Mark as Paid"
        message={markError ? markError : `Mark fee for ${confirmItem?.monthKey ?? ''} as paid?`}
        confirmLabel="Mark Paid"
        onConfirm={handleMarkPaid}
        onCancel={() => {
          setConfirmItem(null);
          setMarkError(null);
        }}
        loading={marking}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
});
