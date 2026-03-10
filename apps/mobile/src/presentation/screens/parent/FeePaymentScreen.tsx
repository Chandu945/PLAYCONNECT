import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFeePaymentFlow } from '../../../application/parent/use-fee-payment-flow';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { formatMonthKey, formatCurrency } from '../../utils/format';
import { CONVENIENCE_FEE_RATE } from '@playconnect/contracts';
import { useTheme } from '../../context/ThemeContext';

type FeePaymentRouteParams = {
  FeePayment: { feeDueId: string; monthKey: string; amount: number };
};

function StepIndicator({
  step,
  currentStep,
  label,
}: {
  step: number;
  currentStep: number;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sStyles = useMemo(() => makeStepStyles(colors), [colors]);
  const isActive = step <= currentStep;
  const isCurrent = step === currentStep;
  return (
    <View style={sStyles.container}>
      <View
        style={[
          sStyles.dot,
          isActive && { backgroundColor: colors.primary },
          isCurrent && sStyles.dotCurrent,
        ]}
      >
        {isActive && (
          // @ts-expect-error react-native-vector-icons types
          <Icon name="check" size={12} color={colors.white} />
        )}
      </View>
      <Text style={[sStyles.label, isActive && { color: colors.primary }]}>{label}</Text>
    </View>
  );
}

const makeStepStyles = (colors: Colors) => StyleSheet.create({
  container: { alignItems: 'center', flex: 1 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrent: {
    borderWidth: 2,
    borderColor: colors.primaryLight,
  },
  label: {
    fontSize: fontSizes.xs,
    color: colors.textDisabled,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

export function FeePaymentScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<RouteProp<FeePaymentRouteParams, 'FeePayment'>>();
  const navigation = useNavigation();
  const feeDueId = route.params?.feeDueId ?? '';
  const monthKey = route.params?.monthKey ?? '';
  const amount = route.params?.amount ?? 0;
  const convenienceFee = Math.round(amount * CONVENIENCE_FEE_RATE);
  const totalAmount = amount + convenienceFee;

  const { status, error, startPayment, reset } = useFeePaymentFlow(() => {
    navigation.goBack();
  });

  const isProcessing = status === 'initiating' || status === 'checkout' || status === 'polling';
  const currentStep =
    status === 'initiating' ? 1 : status === 'checkout' ? 2 : status === 'polling' ? 3 : 0;

  return (
    <View style={styles.container}>
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="receipt" size={24} color={colors.primary} />
        </View>
        <View style={styles.summaryDetails}>
          <Text style={styles.summaryLabel}>Fee Payment</Text>
          <Text style={styles.summaryMonth}>{formatMonthKey(monthKey)}</Text>
        </View>
        <View style={styles.summaryAmountContainer}>
          <Text style={styles.summaryAmountLabel}>Total Payable</Text>
          <Text style={styles.summaryAmount}>{formatCurrency(totalAmount)}</Text>
        </View>
      </View>

      {/* Fee Breakdown */}
      <View style={styles.breakdownCard}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Fee Amount</Text>
          <Text style={styles.breakdownValue}>{formatCurrency(amount)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Convenience Fee ({(CONVENIENCE_FEE_RATE * 100).toFixed(1)}%)</Text>
          <Text style={styles.breakdownValue}>{formatCurrency(convenienceFee)}</Text>
        </View>
        <View style={styles.breakdownDivider} />
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownTotalLabel}>Total Payable</Text>
          <Text style={styles.breakdownTotalValue}>{formatCurrency(totalAmount)}</Text>
        </View>
      </View>

      {/* Steps (shown during processing) */}
      {isProcessing && (
        <View style={styles.stepsContainer}>
          <View style={styles.stepsRow}>
            <StepIndicator step={1} currentStep={currentStep} label="Initiate" />
            <View style={styles.stepLine} />
            <StepIndicator step={2} currentStep={currentStep} label="Payment" />
            <View style={styles.stepLine} />
            <StepIndicator step={3} currentStep={currentStep} label="Verify" />
          </View>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.processingSpinner}
          />
          <Text style={styles.processingText}>
            {status === 'initiating'
              ? 'Setting up your payment...'
              : status === 'checkout'
                ? 'Complete payment in the browser...'
                : 'Verifying your payment...'}
          </Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.statusCard}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="close-circle" size={48} color={colors.danger} />
          <Text style={styles.statusTitle}>Payment Failed</Text>
          <Text style={styles.statusMessage}>{error}</Text>
        </View>
      )}

      {/* Success */}
      {status === 'success' && (
        <View style={styles.statusCard}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="check-circle" size={48} color={colors.success} />
          <Text style={[styles.statusTitle, { color: colors.success }]}>
            Payment Successful!
          </Text>
          <Text style={styles.statusMessage}>
            Your fee for {formatMonthKey(monthKey)} has been paid successfully.
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {!isProcessing && status !== 'success' && (
          <TouchableOpacity
            style={styles.payButton}
            activeOpacity={0.8}
            onPress={() => startPayment(feeDueId)}
          >
            {/* @ts-expect-error react-native-vector-icons types */}
            <Icon name="shield-check-outline" size={20} color={colors.white} />
            <Text style={styles.payButtonText}>
              {status === 'failed' ? 'Retry Payment' : 'Pay Securely'}
            </Text>
          </TouchableOpacity>
        )}

        {status === 'success' && (
          <TouchableOpacity style={styles.doneButton} onPress={reset}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Secure badge */}
      {!isProcessing && status !== 'success' && status !== 'failed' && (
        <View style={styles.secureBadge}>
          {/* @ts-expect-error react-native-vector-icons types */}
          <Icon name="lock-outline" size={14} color={colors.textDisabled} />
          <Text style={styles.secureText}>Secured by Cashfree</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, padding: spacing.base, backgroundColor: colors.bg },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    ...shadows.md,
    marginBottom: spacing.lg,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  summaryDetails: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  summaryMonth: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  summaryAmountContainer: {
    alignItems: 'flex-end',
  },
  summaryAmountLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  summaryAmount: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.base,
    ...shadows.sm,
    marginBottom: spacing.lg,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  breakdownLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  breakdownValue: {
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  breakdownTotalLabel: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  breakdownTotalValue: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  stepsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.sm,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  processingSpinner: {
    marginBottom: spacing.md,
  },
  processingText: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.sm,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  statusMessage: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: spacing.lg,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.base,
    ...shadows.md,
  },
  payButtonText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  doneButton: {
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.xl,
    paddingVertical: spacing.base,
  },
  doneButtonText: {
    color: colors.white,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  secureText: {
    fontSize: fontSizes.sm,
    color: colors.textDisabled,
  },
});
