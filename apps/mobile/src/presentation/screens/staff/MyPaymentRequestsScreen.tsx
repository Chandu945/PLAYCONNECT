import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FeesStackParamList } from '../../navigation/FeesStack';
import type { AppError } from '../../../domain/common/errors';
import type { PaymentRequestItem } from '../../../domain/fees/payment-requests.types';
import { listPaymentRequestsUseCase } from '../../../application/fees/use-cases/list-payment-requests.usecase';
import { staffCancelPaymentRequestUseCase } from '../../../application/fees/use-cases/staff-cancel-payment-request.usecase';
import {
  listPaymentRequests,
  cancelPaymentRequest,
} from '../../../infra/fees/payment-requests-api';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { RequestRow } from '../../components/fees/RequestRow';
import { spacing } from '../../theme';

const requestsApi = { listPaymentRequests, cancelPaymentRequest };

type NavProp = NativeStackNavigationProp<FeesStackParamList, 'FeesHome'>;

export function MyPaymentRequestsScreen() {
  const navigation = useNavigation<NavProp>();
  const [items, setItems] = useState<PaymentRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PaymentRequestItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);

    const result = await listPaymentRequestsUseCase({ paymentRequestsApi: requestsApi });

    if (!mountedRef.current) return;

    if (result.ok) {
      setItems(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const handleCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);

    const result = await staffCancelPaymentRequestUseCase(
      { paymentRequestsApi: requestsApi },
      cancelTarget.id,
    );

    setCancelling(false);

    if (result.ok) {
      setCancelTarget(null);
      load();
    } else {
      setCancelError(result.error.message);
    }
  }, [cancelTarget, load]);

  const handleEdit = useCallback(
    (item: PaymentRequestItem) => {
      navigation.navigate('PaymentRequestForm', {
        studentId: item.studentId,
        monthKey: item.monthKey,
        amount: item.amount,
        requestId: item.id,
        existingNotes: item.staffNotes,
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: PaymentRequestItem }) => (
      <RequestRow
        item={item}
        onCancel={item.status === 'PENDING' ? () => setCancelTarget(item) : undefined}
        onEdit={item.status === 'PENDING' ? () => handleEdit(item) : undefined}
      />
    ),
    [handleEdit],
  );

  const keyExtractor = useCallback((item: PaymentRequestItem) => item.id, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  if (loading && !refreshing) {
    return (
      <View style={styles.content} testID="skeleton-container">
        <SkeletonTile />
        <SkeletonTile />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.content}>
        <InlineError message={error.message} onRetry={load} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.length === 0 ? (
        <EmptyState message="No payment requests" />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          testID="my-requests-list"
        />
      )}

      <ConfirmSheet
        visible={cancelTarget !== null}
        title="Cancel Request"
        message={
          cancelError ? cancelError : `Cancel payment request for ${cancelTarget?.monthKey ?? ''}?`
        }
        confirmLabel="Cancel Request"
        confirmVariant="danger"
        onConfirm={handleCancel}
        onCancel={() => {
          setCancelTarget(null);
          setCancelError(null);
        }}
        loading={cancelling}
        testID="cancel-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
});
