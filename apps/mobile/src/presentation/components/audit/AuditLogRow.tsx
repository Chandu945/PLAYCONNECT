import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppCard } from '../ui/AppCard';
import { fontSizes, fontWeights, radius, spacing } from '../../theme';
import type { Colors } from '../../theme';
import type { AuditLogItem } from '../../../domain/audit/audit.types';
import { useTheme } from '../../context/ThemeContext';

const ACTION_LABELS: Record<string, string> = {
  STUDENT_CREATED: 'Student Created',
  STUDENT_UPDATED: 'Student Updated',
  STUDENT_STATUS_CHANGED: 'Student Status Changed',
  STUDENT_DELETED: 'Student Deleted',
  STUDENT_ATTENDANCE_EDITED: 'Attendance Edited',
  PAYMENT_REQUEST_CREATED: 'Payment Request Created',
  PAYMENT_REQUEST_CANCELLED: 'Payment Cancelled',
  PAYMENT_REQUEST_APPROVED: 'Payment Approved',
  PAYMENT_REQUEST_REJECTED: 'Payment Rejected',
  STAFF_ATTENDANCE_CHANGED: 'Staff Attendance Changed',
  MONTHLY_DUES_ENGINE_RAN: 'Monthly Dues Engine Ran',
};

const MAX_CONTEXT_KEYS = 6;
const MAX_VALUE_LENGTH = 40;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function truncate(val: string, max: number): string {
  return val.length > max ? val.slice(0, max) + '...' : val;
}

type AuditLogRowProps = {
  item: AuditLogItem;
  testID?: string;
};

function AuditLogRowComponent({ item, testID }: AuditLogRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const contextEntries = item.context
    ? Object.entries(item.context).slice(0, MAX_CONTEXT_KEYS)
    : [];

  return (
    <AppCard style={styles.row} testID={testID}>
      <View style={styles.header}>
        <Text style={styles.actionLabel} testID={testID ? `${testID}-action` : undefined}>
          {ACTION_LABELS[item.action] ?? item.action}
        </Text>
        <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
      </View>

      <View style={styles.meta}>
        <Text style={styles.entityText}>
          {item.entityType} {item.entityId ? `#${item.entityId.slice(0, 8)}` : ''}
        </Text>
        <Text style={styles.actorText}>by {item.actorName ?? item.actorUserId.slice(0, 8)}</Text>
      </View>

      {contextEntries.length > 0 && (
        <View style={styles.contextRow}>
          {contextEntries.map(([key, val]) => (
            <View key={key} style={styles.chip}>
              <Text style={styles.chipText}>
                {key}: {truncate(val, MAX_VALUE_LENGTH)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </AppCard>
  );
}

export const AuditLogRow = memo(AuditLogRowComponent);

const makeStyles = (colors: Colors) => StyleSheet.create({
  row: {
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flex: 1,
  },
  time: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  entityText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  actorText: {
    fontSize: fontSizes.sm,
    color: colors.textDisabled,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: fontSizes.xs,
    color: colors.textLight,
  },
});
