import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { AUDIT_ACTION_TYPES, AUDIT_ENTITY_TYPES } from '@playconnect/contracts';
import type { AuditFilters as AuditFiltersType } from '../../../application/audit/use-audit-logs';
import { Button } from '../ui/Button';
import { fontSizes, fontWeights, radius, shadows, spacing } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

const ACTION_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Actions', value: '' },
  ...AUDIT_ACTION_TYPES.map((a) => ({
    label: a.replace(/_/g, ' '),
    value: a,
  })),
];

const ENTITY_OPTIONS: { label: string; value: string }[] = [
  { label: 'All Entities', value: '' },
  ...AUDIT_ENTITY_TYPES.map((e) => ({
    label: e.replace(/_/g, ' '),
    value: e,
  })),
];

type AuditFiltersProps = {
  filters: AuditFiltersType;
  onChange: (f: AuditFiltersType) => void;
  onApply: () => void;
  onClear: () => void;
};

export function AuditFiltersPanel({ filters, onChange, onApply, onClear }: AuditFiltersProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fromValid = !filters.from || /^\d{4}-\d{2}-\d{2}$/.test(filters.from);
  const toValid = !filters.to || /^\d{4}-\d{2}-\d{2}$/.test(filters.to);
  const rangeValid =
    !filters.from || !filters.to || filters.from <= filters.to;
  const canApply = fromValid && toValid && rangeValid;

  return (
    <View style={styles.container} testID="audit-filters">
      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.label}>From</Text>
          <TextInput
            style={styles.input}
            value={filters.from}
            onChangeText={(v) => onChange({ ...filters, from: v })}
            placeholder="YYYY-MM-DD"
            testID="filter-from"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>To</Text>
          <TextInput
            style={styles.input}
            value={filters.to}
            onChangeText={(v) => onChange({ ...filters, to: v })}
            placeholder="YYYY-MM-DD"
            testID="filter-to"
          />
        </View>
      </View>

      {!rangeValid && (
        <Text style={styles.errorHint} testID="filter-range-error">
          From must be before To
        </Text>
      )}

      <Text style={styles.label}>Action Type</Text>
      <View style={styles.actionRow} testID="action-type-options">
        {ACTION_OPTIONS.map((opt) => (
          <Text
            key={opt.value}
            style={[
              styles.actionChip,
              filters.action === opt.value && styles.actionChipActive,
            ]}
            onPress={() => onChange({ ...filters, action: opt.value as AuditFiltersType['action'] })}
            testID={`action-opt-${opt.value || 'ALL'}`}
          >
            {opt.label}
          </Text>
        ))}
      </View>

      <Text style={styles.label}>Entity Type</Text>
      <View style={styles.actionRow} testID="entity-type-options">
        {ENTITY_OPTIONS.map((opt) => (
          <Text
            key={opt.value}
            style={[
              styles.actionChip,
              filters.entityType === opt.value && styles.actionChipActive,
            ]}
            onPress={() => onChange({ ...filters, entityType: opt.value as AuditFiltersType['entityType'] })}
            testID={`entity-opt-${opt.value || 'ALL'}`}
          >
            {opt.label}
          </Text>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <View style={styles.btnWrap}>
          <Button title="Apply" onPress={onApply} disabled={!canApply} testID="filter-apply" />
        </View>
        <View style={styles.btnWrap}>
          <Button title="Clear" onPress={onClear} variant="secondary" testID="filter-clear" />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textMedium,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    padding: spacing.sm,
    fontSize: fontSizes.base,
    color: colors.text,
  },
  errorHint: {
    fontSize: fontSizes.sm,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  actionChip: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.textLight,
    overflow: 'hidden',
  },
  actionChipActive: {
    backgroundColor: colors.primary,
    color: colors.white,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnWrap: {
    flex: 1,
  },
});
