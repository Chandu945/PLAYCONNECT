import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, FlatList, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RouteProp } from '@react-navigation/native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FeesStackParamList } from '../../navigation/FeesStack';
import type { AppError } from '../../../domain/common/errors';
import type { FeeDueItem } from '../../../domain/fees/fees.types';
import type { PaymentRequestItem } from '../../../domain/fees/payment-requests.types';
import { getStudentFeeDetailUseCase } from '../../../application/fees/use-cases/get-student-fee-detail.usecase';
import { ownerMarkPaidUseCase } from '../../../application/fees/use-cases/owner-mark-paid.usecase';
import { listPaymentRequestsUseCase } from '../../../application/fees/use-cases/list-payment-requests.usecase';
import { staffCancelPaymentRequestUseCase } from '../../../application/fees/use-cases/staff-cancel-payment-request.usecase';
import { getStudentFees, markFeePaid } from '../../../infra/fees/fees-api';
import {
  listPaymentRequests,
  cancelPaymentRequest,
} from '../../../infra/fees/payment-requests-api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmSheet } from '../../components/ui/ConfirmSheet';
import { FeeDueRow } from '../../components/fees/FeeDueRow';
import { PendingRequestSheet } from '../../components/fees/PendingRequestSheet';
import { computeOutstandingSummary } from '../../../domain/fees/fee-summary';
import { formatCurrency as formatAmount, formatMonthShort } from '../../utils/format';
import { spacing, listDefaults, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Route = RouteProp<FeesStackParamList, 'StudentFeeDetail'>;
type Nav = NativeStackNavigationProp<FeesStackParamList, 'StudentFeeDetail'>;

const detailApi = { getStudentFees };
const markPaidApi = { markFeePaid };
const requestsApi = { listPaymentRequests, cancelPaymentRequest };

export function StudentFeeDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isOwner = user?.role === 'OWNER';
  const isStaff = user?.role === 'STAFF';
  const studentId = route.params?.studentId ?? '';
  const studentName = route.params?.studentName;

  const [items, setItems] = useState<FeeDueItem[]>([]);
  const [pendingByFeeDue, setPendingByFeeDue] = useState<Map<string, PaymentRequestItem>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  // Owner mark-paid flow (existing)
  const [confirmItem, setConfirmItem] = useState<FeeDueItem | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  // Staff pending-request management flow (new)
  const [sheetTarget, setSheetTarget] = useState<{
    request: PaymentRequestItem;
    fee: FeeDueItem;
  } | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<PaymentRequestItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No range → API returns the student's full fee history (joining month →
      // current month), so older overdue dues are shown and the headline total
      // matches the Fees list row.
      // Parallel: student fees + ALL pending requests for this student
      // (regardless of author or source). The studentId filter on the
      // payment-requests endpoint is what makes parent-source and
      // other-staff-source pending requests visible here — without it the
      // staff endpoint scopes to the caller's own requests only.
      const [feesResult, requestsResult] = await Promise.all([
        getStudentFeeDetailUseCase({ feesApi: detailApi }, studentId),
        isStaff
          ? listPaymentRequestsUseCase(
              { paymentRequestsApi: requestsApi },
              'PENDING',
              studentId,
            )
          : Promise.resolve(null),
      ]);

      if (!mountedRef.current) return;

      if (!feesResult.ok) {
        setError(feesResult.error);
        return;
      }

      setItems(feesResult.value);

      // Pending request map. Owners and parents skip this entirely. Staff get
      // a `feeDueId → request` lookup of their own in-flight requests so
      // tapping a row jumps straight to manage instead of failing on submit.
      if (requestsResult && requestsResult.ok) {
        const map = new Map<string, PaymentRequestItem>();
        for (const req of requestsResult.value.items) {
          if (req.studentId === studentId && req.status === 'PENDING') {
            map.set(req.feeDueId, req);
          }
        }
        setPendingByFeeDue(map);
      } else {
        // Failure to load pending list is non-fatal — tap-through still
        // works and the backend will reject duplicates with an error if any
        // slip through. We just lose the inline pill.
        setPendingByFeeDue(new Map());
      }
    } catch (e) {
      if (__DEV__) console.error('[StudentFeeDetail] Load failed:', e);
      if (mountedRef.current) {
        setError({ code: 'UNKNOWN', message: 'Something went wrong.' });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [studentId, isStaff]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Refresh each time screen gains focus (e.g. after creating/cancelling a request)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRowPress = useCallback(
    (item: FeeDueItem) => {
      if (item.status === 'PAID') return;

      if (isOwner) {
        setConfirmItem(item);
        return;
      }

      if (!isStaff) return;

      // Pending-request rerouting: if this fee already has a request in
      // flight (created by this staff), open the manage sheet instead of
      // the create form — saves a guaranteed backend rejection.
      const pending = pendingByFeeDue.get(item.id);
      if (pending) {
        setSheetTarget({ request: pending, fee: item });
        return;
      }

      navigation.navigate('PaymentRequestForm', {
        studentId: item.studentId,
        monthKey: item.monthKey,
        amount: item.totalPayable,
        baseAmount: item.amount,
        lateFee: item.lateFee,
        studentName,
      });
    },
    [isOwner, isStaff, navigation, pendingByFeeDue, studentName],
  );

  const handleMarkPaid = useCallback(async () => {
    if (!confirmItem) return;
    setMarking(true);
    setMarkError(null);
    try {
      const result = await ownerMarkPaidUseCase(
        { feesApi: markPaidApi },
        confirmItem.studentId,
        confirmItem.monthKey,
      );

      if (!mountedRef.current) return;

      if (result.ok) {
        setConfirmItem(null);
        load();
      } else {
        setMarkError(result.error.message);
      }
    } catch (e) {
      if (__DEV__) console.error('[StudentFeeDetail] Mark paid failed:', e);
      if (mountedRef.current) {
        setMarkError('Something went wrong. Please try again.');
      }
    } finally {
      if (mountedRef.current) setMarking(false);
    }
  }, [confirmItem, load]);

  const handleEditFromSheet = useCallback(() => {
    if (!sheetTarget) return;
    const { request, fee } = sheetTarget;
    setSheetTarget(null);
    navigation.navigate('PaymentRequestForm', {
      studentId: fee.studentId,
      monthKey: fee.monthKey,
      amount: fee.totalPayable,
      baseAmount: fee.amount,
      lateFee: fee.lateFee,
      studentName,
      requestId: request.id,
      existingNotes: request.staffNotes,
    });
  }, [navigation, sheetTarget, studentName]);

  const handleCancelFromSheet = useCallback(() => {
    if (!sheetTarget) return;
    setCancelConfirm(sheetTarget.request);
    setSheetTarget(null);
  }, [sheetTarget]);

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelConfirm) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await staffCancelPaymentRequestUseCase(
        { paymentRequestsApi: requestsApi },
        cancelConfirm.id,
      );

      if (!mountedRef.current) return;

      if (result.ok) {
        setCancelConfirm(null);
        showToast('Request cancelled');
        load();
      } else {
        setCancelError(result.error.message);
      }
    } catch (e) {
      if (__DEV__) console.error('[StudentFeeDetail] Cancel request failed:', e);
      if (mountedRef.current) {
        setCancelError('Something went wrong. Please try again.');
      }
    } finally {
      if (mountedRef.current) setCancelling(false);
    }
  }, [cancelConfirm, load, showToast]);

  const renderItem = useCallback(
    ({ item }: { item: FeeDueItem }) => {
      const pending = pendingByFeeDue.get(item.id);
      return (
        <FeeDueRow
          item={item}
          onPress={() => handleRowPress(item)}
          showStudentName={false}
          pendingRequest={
            pending
              ? { request: pending, mine: pending.staffUserId === user?.id }
              : null
          }
        />
      );
    },
    [handleRowPress, pendingByFeeDue, user?.id],
  );

  const keyExtractor = useCallback((item: FeeDueItem) => item.id, []);

  // Outstanding total across every unpaid month — shared with the Students-tab
  // detail so both screens show the same headline that matches the Fees list.
  const summary = useMemo(() => computeOutstandingSummary(items), [items]);

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
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      {items.length === 0 ? (
        <EmptyState message="No fee records found" />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          testID="student-fee-list"
          ListHeaderComponent={
            summary.monthsCount > 0 ? (
              <View style={styles.summaryCard} testID="student-fee-outstanding">
                <Text style={styles.summaryLabel}>Outstanding</Text>
                <Text style={styles.summaryAmount}>{formatAmount(summary.totalOutstanding)}</Text>
                <Text style={styles.summaryMeta}>
                  {summary.monthsCount} {summary.monthsCount === 1 ? 'month' : 'months'} ·{' '}
                  {summary.monthKeys.map(formatMonthShort).join(', ')}
                </Text>
              </View>
            ) : null
          }
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

      <PendingRequestSheet
        visible={sheetTarget !== null}
        request={sheetTarget?.request ?? null}
        baseAmount={sheetTarget?.fee.amount}
        lateFee={sheetTarget?.fee.lateFee}
        mine={sheetTarget?.request.staffUserId === user?.id}
        onClose={() => setSheetTarget(null)}
        onEdit={handleEditFromSheet}
        onCancelRequest={handleCancelFromSheet}
      />

      <ConfirmSheet
        visible={cancelConfirm !== null}
        title="Cancel payment request?"
        message={
          cancelError
            ? cancelError
            : 'This will withdraw your collection record. You can submit a new request later if needed.'
        }
        confirmLabel="Cancel request"
        confirmVariant="danger"
        icon="alert-circle-outline"
        iconVariant="danger"
        onConfirm={handleConfirmCancel}
        onCancel={() => {
          setCancelConfirm(null);
          setCancelError(null);
        }}
        loading={cancelling}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: listDefaults.contentPaddingBottomNoFab,
    marginTop: spacing.base,
  },
  summaryCard: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  summaryLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  summaryAmount: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.warningText,
    marginTop: 2,
  },
  summaryMeta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
