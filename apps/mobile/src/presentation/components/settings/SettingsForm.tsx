import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import type { AcademySettings, UpdateAcademySettingsRequest } from '../../../domain/settings/academy-settings.types';
import type { AppError } from '../../../domain/common/errors';
import { Button } from '../ui/Button';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type SettingsFormProps = {
  settings: AcademySettings;
  editable: boolean;
  saving: boolean;
  error: AppError | null;
  onSave: (req: UpdateAcademySettingsRequest) => Promise<AppError | null>;
};

const REPEAT_INTERVALS = [1, 3, 5] as const;

export function SettingsForm({ settings, editable, saving, error, onSave }: SettingsFormProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [receiptPrefix, setReceiptPrefix] = useState(settings.receiptPrefix);
  const [dueDateDay, setDueDateDay] = useState(String(settings.defaultDueDateDay));
  const [lateFeeEnabled, setLateFeeEnabled] = useState(settings.lateFeeEnabled);
  const [gracePeriodDays, setGracePeriodDays] = useState(String(settings.gracePeriodDays));
  const [lateFeeAmount, setLateFeeAmount] = useState(String(settings.lateFeeAmountInr));
  const [repeatInterval, setRepeatInterval] = useState(settings.lateFeeRepeatIntervalDays);

  const isDirty =
    receiptPrefix !== settings.receiptPrefix ||
    dueDateDay !== String(settings.defaultDueDateDay) ||
    lateFeeEnabled !== settings.lateFeeEnabled ||
    gracePeriodDays !== String(settings.gracePeriodDays) ||
    lateFeeAmount !== String(settings.lateFeeAmountInr) ||
    repeatInterval !== settings.lateFeeRepeatIntervalDays;

  const dayNum = parseInt(dueDateDay, 10);
  const dayValid = !isNaN(dayNum) && dayNum >= 1 && dayNum <= 28;
  const prefixValid = receiptPrefix.length > 0 && receiptPrefix.length <= 20;
  const graceNum = parseInt(gracePeriodDays, 10);
  const graceValid = !isNaN(graceNum) && graceNum >= 0 && graceNum <= 30;
  const feeAmtNum = parseInt(lateFeeAmount, 10);
  const feeAmtValid = !isNaN(feeAmtNum) && feeAmtNum >= 0 && feeAmtNum <= 10000;
  const canSave = editable && isDirty && dayValid && prefixValid && (!lateFeeEnabled || (graceValid && feeAmtValid)) && !saving;

  const handleSave = useCallback(async () => {
    const req: UpdateAcademySettingsRequest = {};
    if (receiptPrefix !== settings.receiptPrefix) {
      req.receiptPrefix = receiptPrefix;
    }
    if (dueDateDay !== String(settings.defaultDueDateDay)) {
      req.defaultDueDateDay = parseInt(dueDateDay, 10);
    }
    if (lateFeeEnabled !== settings.lateFeeEnabled) {
      req.lateFeeEnabled = lateFeeEnabled;
    }
    if (gracePeriodDays !== String(settings.gracePeriodDays)) {
      req.gracePeriodDays = parseInt(gracePeriodDays, 10);
    }
    if (lateFeeAmount !== String(settings.lateFeeAmountInr)) {
      req.lateFeeAmountInr = parseInt(lateFeeAmount, 10);
    }
    if (repeatInterval !== settings.lateFeeRepeatIntervalDays) {
      req.lateFeeRepeatIntervalDays = repeatInterval;
    }

    const saveError = await onSave(req);
    if (!saveError) {
      Alert.alert('Saved', 'Settings updated successfully.');
    }
  }, [receiptPrefix, dueDateDay, lateFeeEnabled, gracePeriodDays, lateFeeAmount, repeatInterval, settings, onSave]);

  return (
    <View testID="settings-form">
      <Text style={styles.label}>Receipt Prefix</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={receiptPrefix}
        onChangeText={setReceiptPrefix}
        editable={editable}
        maxLength={20}
        placeholder="e.g. PC"
        testID="input-receipt-prefix"
      />
      {editable && !prefixValid && receiptPrefix.length === 0 && (
        <Text style={styles.hint} testID="prefix-error">
          Required
        </Text>
      )}

      <Text style={styles.label}>Default Due Date Day (1–28)</Text>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={dueDateDay}
        onChangeText={setDueDateDay}
        editable={editable}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="e.g. 5"
        testID="input-due-date-day"
      />
      {editable && !dayValid && dueDateDay.length > 0 && (
        <Text style={styles.hint} testID="day-error">
          Must be 1–28
        </Text>
      )}

      {/* Late Fee Section */}
      <View style={styles.sectionDivider} />
      <Text style={styles.sectionTitle}>Late Fee</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Enable Late Fee</Text>
        <Switch
          value={lateFeeEnabled}
          onValueChange={setLateFeeEnabled}
          disabled={!editable}
          trackColor={{ false: colors.border, true: colors.primaryLight }}
          thumbColor={lateFeeEnabled ? colors.primary : colors.textDisabled}
          testID="switch-late-fee"
        />
      </View>

      {lateFeeEnabled && (
        <>
          <Text style={styles.label}>Grace Period (days, 0–30)</Text>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            value={gracePeriodDays}
            onChangeText={setGracePeriodDays}
            editable={editable}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="e.g. 5"
            testID="input-grace-period"
          />
          {editable && !graceValid && gracePeriodDays.length > 0 && (
            <Text style={styles.hint}>Must be 0–30</Text>
          )}

          <Text style={styles.label}>Late Fee Amount (INR)</Text>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            value={lateFeeAmount}
            onChangeText={setLateFeeAmount}
            editable={editable}
            keyboardType="number-pad"
            maxLength={5}
            placeholder="e.g. 50"
            testID="input-late-fee-amount"
          />
          {editable && !feeAmtValid && lateFeeAmount.length > 0 && (
            <Text style={styles.hint}>Must be 0–10000</Text>
          )}

          <Text style={styles.label}>Repeat Every (days)</Text>
          <View style={styles.intervalRow}>
            {REPEAT_INTERVALS.map((interval) => (
              <TouchableOpacity
                key={interval}
                style={[
                  styles.intervalBtn,
                  repeatInterval === interval && { backgroundColor: colors.primary },
                ]}
                onPress={() => editable && setRepeatInterval(interval)}
                disabled={!editable}
                testID={`interval-btn-${interval}`}
              >
                <Text
                  style={[
                    styles.intervalBtnText,
                    repeatInterval === interval && { color: colors.white },
                  ]}
                >
                  {interval}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {error && (
        <Text style={styles.errorText} testID="settings-save-error">
          {error.message}
        </Text>
      )}

      {editable && (
        <View style={styles.buttonRow}>
          <Button
            title="Save"
            onPress={handleSave}
            disabled={!canSave}
            loading={saving}
            testID="settings-save-btn"
          />
        </View>
      )}

      {!editable && (
        <Text style={styles.readOnlyNote} testID="read-only-note">
          Only the academy owner can edit settings.
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  label: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textMedium,
    marginBottom: 6,
    marginTop: spacing.base,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSizes.lg,
    color: colors.text,
  },
  inputDisabled: {
    backgroundColor: colors.bgSubtle,
    color: colors.textSecondary,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  errorText: {
    fontSize: fontSizes.base,
    color: colors.danger,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  buttonRow: {
    marginTop: spacing.xl,
  },
  readOnlyNote: {
    fontSize: fontSizes.sm,
    color: colors.textDisabled,
    marginTop: spacing.lg,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: fontSizes.base,
    color: colors.text,
  },
  intervalRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  intervalBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  intervalBtnText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
});
