import React, { useState, useCallback, useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { FeesStackParamList } from '../../navigation/FeesStack';
import {
  validatePaymentRequestForm,
  staffCreatePaymentRequestUseCase,
} from '../../../application/fees/use-cases/staff-create-payment-request.usecase';
import { staffEditPaymentRequestUseCase } from '../../../application/fees/use-cases/staff-edit-payment-request.usecase';
import { createPaymentRequest, editPaymentRequest } from '../../../infra/fees/payment-requests-api';
import { TextArea } from '../../components/ui/TextArea';
import { Button } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { spacing, fontSizes, fontWeights, radius, shadows } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Route = RouteProp<FeesStackParamList, 'PaymentRequestForm'>;

const requestsApi = { createPaymentRequest, editPaymentRequest };

export function PaymentRequestFormScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const studentId = route.params?.studentId ?? '';
  const monthKey = route.params?.monthKey ?? '';
  const amount = route.params?.amount ?? 0;
  const requestId = route.params?.requestId;
  const existingNotes = route.params?.existingNotes;
  const isEditMode = !!requestId;

  const [staffNotes, setStaffNotes] = useState(existingNotes ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const errors = validatePaymentRequestForm({ staffNotes });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setServerError(null);
    setSubmitting(true);

    const result = isEditMode
      ? await staffEditPaymentRequestUseCase(
          { paymentRequestsApi: requestsApi },
          requestId,
          { staffNotes: staffNotes.trim() },
        )
      : await staffCreatePaymentRequestUseCase(
          { paymentRequestsApi: requestsApi },
          { studentId, monthKey, staffNotes: staffNotes.trim() },
        );

    setSubmitting(false);

    if (result.ok) {
      navigation.goBack();
    } else {
      setServerError(result.error.message);
    }
  }, [staffNotes, studentId, monthKey, navigation, isEditMode, requestId]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {serverError && <InlineError message={serverError} />}

      <View style={styles.infoRow}>
        <Text style={styles.label}>Month</Text>
        <Text style={styles.value}>{monthKey}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Amount</Text>
        <Text style={styles.value}>{`\u20B9${amount}`}</Text>
      </View>

      <TextArea
        label="Collection Notes (how was fee collected?)"
        value={staffNotes}
        onChangeText={setStaffNotes}
        placeholder="e.g. Collected cash from guardian at academy"
        error={fieldErrors['staffNotes']}
        testID="input-staffNotes"
      />

      <View style={styles.submitContainer}>
        <Button
          title={isEditMode ? 'Update Request' : 'Submit Request'}
          onPress={handleSubmit}
          loading={submitting}
          testID="submit-button"
        />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.base,
    paddingBottom: 40,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  value: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  submitContainer: {
    marginTop: spacing.sm,
  },
});
