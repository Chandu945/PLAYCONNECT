import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import Share from 'react-native-share';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { ReceiptInfo } from '../../../domain/parent/parent.types';
import { getReceiptUseCase } from '../../../application/parent/use-cases/get-receipt.usecase';
import { parentApi } from '../../../infra/parent/parent-api';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { formatMonthKey, formatCurrency, formatDateLong } from '../../utils/format';
import { useTheme } from '../../context/ThemeContext';

type ReceiptRouteParams = {
  Receipt: { feeDueId: string };
};

function ReceiptRow({
  icon,
  label,
  value,
  valueColor,
  valueBold,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  valueBold?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rowStyles = useMemo(() => makeRowStyles(colors), [colors]);
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.labelRow}>
        {/* @ts-expect-error react-native-vector-icons types */}
        <Icon name={icon} size={16} color={colors.textDisabled} />
        <Text style={rowStyles.label}>{label}</Text>
      </View>
      <Text
        style={[
          rowStyles.value,
          valueColor ? { color: valueColor } : undefined,
          valueBold ? { fontWeight: fontWeights.bold, fontSize: fontSizes.lg } : undefined,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const makeRowStyles = (colors: Colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
  },
  value: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.text,
    maxWidth: '55%',
    textAlign: 'right',
  },
});

export function ReceiptScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rowStyles = useMemo(() => makeRowStyles(colors), [colors]);
  const route = useRoute<RouteProp<ReceiptRouteParams, 'Receipt'>>();
  const feeDueId = route.params?.feeDueId ?? '';

  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getReceiptUseCase({ parentApi }, feeDueId);
    if (!mountedRef.current) return;
    if (result.ok) {
      setReceipt(result.value);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  }, [feeDueId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const handleShare = useCallback(async () => {
    if (!receipt) return;
    const message = [
      '--- Payment Receipt ---',
      `Receipt #: ${receipt.receiptNumber}`,
      `Student: ${receipt.studentName}`,
      `Academy: ${receipt.academyName}`,
      `Month: ${formatMonthKey(receipt.monthKey)}`,
      `Amount: ${formatCurrency(receipt.amount)}`,
      `Paid On: ${formatDateLong(receipt.paidAt)}`,
      `Method: ${receipt.paymentMethod}`,
      '------------------------',
    ].join('\n');

    try {
      await Share.open({ message, title: 'Payment Receipt' });
    } catch (e: any) {
      // User cancelled share - ignore
      if (e?.message !== 'User did not share') {
        Alert.alert('Error', 'Could not share receipt. Please try again.');
      }
    }
  }, [receipt]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading receipt...</Text>
      </View>
    );
  }

  if (error || !receipt) {
    return (
      <View style={styles.center}>
        {/* @ts-expect-error react-native-vector-icons types */}
        <Icon name="file-document-remove-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>{error ?? 'Receipt not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={load}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Success Badge */}
        <View style={styles.successBadge}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="check-circle" size={40} color={colors.success} />
        </View>

        <Text style={styles.receiptTitle}>Payment Receipt</Text>
        <Text style={styles.receiptNumber}>#{receipt.receiptNumber}</Text>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.dividerDot} />
          <View style={styles.dividerLine} />
        </View>

        <ReceiptRow icon="account-outline" label="Student" value={receipt.studentName} />
        <ReceiptRow icon="office-building-outline" label="Academy" value={receipt.academyName} />
        <ReceiptRow icon="calendar-month-outline" label="Month" value={formatMonthKey(receipt.monthKey)} />
        <ReceiptRow
          icon="currency-inr"
          label="Amount"
          value={formatCurrency(receipt.amount)}
          valueColor={colors.success}
          valueBold
        />
        <ReceiptRow icon="calendar-check-outline" label="Paid On" value={formatDateLong(receipt.paidAt)} />
        <View style={[rowStyles.row, { borderBottomWidth: 0 }]}>
          <View style={rowStyles.labelRow}>
            {/* @ts-expect-error react-native-vector-icons types */}
            <Icon name="credit-card-outline" size={16} color={colors.textDisabled} />
            <Text style={rowStyles.label}>Method</Text>
          </View>
          <Text style={rowStyles.value}>{receipt.paymentMethod}</Text>
        </View>
      </View>

      {/* Share Button */}
      <TouchableOpacity style={styles.shareButton} activeOpacity={0.8} onPress={handleShare}>
        {/* @ts-expect-error react-native-vector-icons types */}
        <Icon name="share-variant-outline" size={20} color={colors.white} />
        <Text style={styles.shareButtonText}>Share Receipt</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, padding: spacing.base, backgroundColor: colors.bg },
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.lg,
  },
  successBadge: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  receiptTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  receiptNumber: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.sm,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
  },
  shareButtonText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
});
