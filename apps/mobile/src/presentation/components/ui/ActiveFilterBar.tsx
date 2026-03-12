import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

export type ActiveFilter = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

type Props = {
  filters: ActiveFilter[];
  onClearAll: () => void;
};

export function ActiveFilterBar({ filters, onClearAll }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (filters.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {filters.map((f) => (
          <View key={f.key} style={styles.pill}>
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon name="check-circle" size={14} color={colors.primary} />
            <Text style={styles.pillText} numberOfLines={1}>
              <Text style={styles.pillLabel}>{f.label}: </Text>
              {f.value}
            </Text>
            <TouchableOpacity
              onPress={f.onRemove}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              style={styles.pillClose}
            >
              {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
              <Icon name="close-circle" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}
        {filters.length > 1 && (
          <TouchableOpacity style={styles.clearAllBtn} onPress={onClearAll}>
            {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
            <Icon name="filter-remove-outline" size={14} color={colors.danger} />
            <Text style={styles.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: 5,
    gap: 5,
  },
  pillText: {
    fontSize: fontSizes.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
    maxWidth: 140,
  },
  pillLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeights.normal,
  },
  pillClose: {
    padding: 2,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    gap: 4,
  },
  clearAllText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.danger,
  },
});
