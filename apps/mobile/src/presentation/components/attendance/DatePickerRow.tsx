import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { fontSizes, fontWeights, spacing, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type DatePickerRowProps = {
  date: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  isToday: boolean;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const month = d.toLocaleDateString('en-IN', { month: 'short' });
  const year = d.getFullYear();
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' });
  return `${weekday}, ${day} ${month} ${year}`;
}

function DatePickerRowComponent({ date, onPrevious, onNext, onToday, isToday }: DatePickerRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Pressable onPress={onPrevious} style={styles.arrow} testID="date-prev">
        {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
        <Icon name="chevron-left" size={20} color={colors.primary} />
      </Pressable>

      <Pressable onPress={onToday} style={styles.dateContainer} testID="date-display">
        {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
        <Icon name="calendar" size={16} color={colors.primary} style={styles.calIcon} />
        <Text style={styles.dateText}>{formatDate(date)}</Text>
        {!isToday && (
          <View style={styles.todayChip}>
            <Text style={styles.todayChipText}>Today</Text>
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={onNext}
        style={[styles.arrow, isToday && styles.arrowDisabled]}
        disabled={isToday}
        testID="date-next"
      >
        {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
        <Icon name="chevron-right" size={20} color={isToday ? colors.textDisabled : colors.primary} />
      </Pressable>
    </View>
  );
}

export const DatePickerRow = memo(DatePickerRowComponent);

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  calIcon: {
    marginRight: 2,
  },
  dateText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  todayChip: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    marginLeft: spacing.xs,
  },
  todayChipText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
});
