import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { BatchListItem } from '../../../domain/batch/batch.types';
import { listBatches } from '../../../infra/batch/batch-api';
import { fontSizes, fontWeights, radius, spacing } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type BatchFilterBarProps = {
  selectedBatchId: string | null;
  onChange: (batchId: string | null, batchName?: string) => void;
};

export function BatchFilterBar({ selectedBatchId, onChange }: BatchFilterBarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const result = await listBatches(1, 100);
      if (!mounted) return;
      if (result.ok && Array.isArray(result.value?.data)) {
        setBatches(result.value.data);
      }
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handlePress = useCallback(
    (batchId: string | null, name?: string) => {
      onChange(batchId, name);
    },
    [onChange],
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (batches.length === 0) {
    return null;
  }

  const allSelected = selectedBatchId === null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Pressable
          style={[styles.chip, allSelected && styles.chipSelected]}
          onPress={() => handlePress(null)}
          testID="batch-filter-all"
        >
          {allSelected && (
            // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
            <Icon name="check" size={14} color={colors.primary} />
          )}
          <Text style={[styles.chipText, allSelected && styles.chipTextSelected]}>
            All Batches
          </Text>
        </Pressable>
        {batches.map((batch) => {
          const isSelected = selectedBatchId === batch.id;
          return (
            <Pressable
              key={batch.id}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => handlePress(batch.id, batch.batchName)}
              testID={`batch-filter-${batch.id}`}
            >
              <View style={[styles.batchInitial, isSelected && styles.batchInitialSelected]}>
                <Text style={[styles.batchInitialText, isSelected && styles.batchInitialTextSelected]}>
                  {batch.batchName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {batch.batchName}
              </Text>
              {isSelected && (
                // @ts-expect-error react-native-vector-icons types incompatible with @types/react@19
                <Icon name="check" size={14} color={colors.primary} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: {
    paddingVertical: spacing.xs,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    gap: 6,
  },
  chipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.textMedium,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.semibold,
  },
  batchInitial: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchInitialSelected: {
    backgroundColor: colors.primaryLight,
  },
  batchInitialText: {
    fontSize: 10,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  batchInitialTextSelected: {
    color: colors.primary,
  },
  loadingContainer: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
});
