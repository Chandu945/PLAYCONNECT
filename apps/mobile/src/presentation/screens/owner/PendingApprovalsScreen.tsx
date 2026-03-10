import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, TextInput, Text, StyleSheet } from 'react-native';
import type { AppError } from '../../../domain/common/errors';
import type { PaymentRequestItem } from '../../../domain/fees/payment-requests.types';
import { listPaymentRequestsUseCase } from '../../../application/fees/use-cases/list-payment-requests.usecase';
import { ownerApproveRequestUseCase } from '../../../application/fees/use-cases/owner-approve-request.usecase';
import { ownerRejectRequestUseCase } from '../../../application/fees/use-cases/owner-reject-request.usecase';
import {
  listPaymentRequests,
  approvePaymentRequest,
  rejectPaymentRequest,
} from '../../../infra/fees/payment-requests-api';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { RequestRow } from '../../components/fees/RequestRow';
import { spacing } from '../../theme';

type PendingApprovalsScreenProps = {
  onActionComplete: () => void;
};

const requestsApi = { listPaymentRequests, approvePaymentRequest, rejectPaymentRequest };

export function PendingApprovalsScreen({ onActionComplete }: PendingApprovalsScreenProps) {
  const [items, setItems] = useState<PaymentRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [actionTarget, setActionTarget] = useState<{
    item: PaymentRequestItem;
    action: 'approve' | 'reject';
  } | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await listPaymentRequestsUseCase({ paymentRequestsApi: requestsApi }, 'PENDING');

    if (!mountedRef.current) return;

    if (result.ok) {
      setItems(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const handleAction = useCallback(async () => {
    if (!actionTarget) return;
    setActing(true);
    setActionError(null);

    let result;
    if (actionTarget.action === 'approve') {
      result = await ownerApproveRequestUseCase(
        { paymentRequestsApi: requestsApi },
        actionTarget.item.id,
      );
    } else {
      const reason = rejectionReason.trim() || 'Rejected by owner';
      result = await ownerRejectRequestUseCase(
        { paymentRequestsApi: requestsApi },
        actionTarget.item.id,
        reason,
      );
    }

    if (!mountedRef.current) return;
    setActing(false);

    if (result.ok) {
      setActionTarget(null);
      setRejectionReason('');
      load();
      onActionComplete();
    } else {
      setActionError(result.error.message);
    }
  }, [actionTarget, load, onActionComplete]);

  const renderItem = useCallback(
    ({ item }: { item: PaymentRequestItem }) => (
      <RequestRow
        item={item}
        onApprove={() => setActionTarget({ item, action: 'approve' })}
        onReject={() => setActionTarget({ item, action: 'reject' })}
      />
    ),
    [],
  );

  const keyExtractor = useCallback((item: PaymentRequestItem) => item.id, []);

  if (loading) {
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
        <EmptyState message="No pending approvals" />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          testID="pending-approvals-list"
        />
      )}

      {actionTarget?.action === 'reject' && (
        <View style={styles.reasonContainer}>
          <Text style={styles.reasonLabel}>Rejection Reason</Text>
          <TextInput
            style={styles.reasonInput}
            value={rejectionReason}
            onChangeText={setRejectionReason}
            placeholder="Enter reason for rejection..."
            multiline
            numberOfLines={3}
            testID="rejection-reason-input"
          />
        </View>
      )}

      <ConfirmSheet
        visible={actionTarget !== null}
        title={actionTarget?.action === 'approve' ? 'Approve Request' : 'Reject Request'}
        message={
          actionError
            ? actionError
            : actionTarget?.action === 'approve'
              ? `Approve payment request for ${actionTarget?.item.monthKey}?`
              : `Reject payment request for ${actionTarget?.item.monthKey}?`
        }
        confirmLabel={actionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
        confirmVariant={actionTarget?.action === 'approve' ? 'primary' : 'danger'}
        onConfirm={handleAction}
        onCancel={() => {
          setActionTarget(null);
          setActionError(null);
          setRejectionReason('');
        }}
        loading={acting}
        testID="approval-confirm"
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
  reasonContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: spacing.xs,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
});
