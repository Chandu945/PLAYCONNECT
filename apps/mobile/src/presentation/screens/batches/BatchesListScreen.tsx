import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  TextInput,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BatchesStackParamList } from '../../navigation/BatchesStack';
import type { BatchListItem } from '../../../domain/batch/batch.types';
import { useBatches } from '../../../application/batch/use-batches';
import { listBatches } from '../../../infra/batch/batch-api';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { SkeletonTile } from '../../components/ui/SkeletonTile';
import { InlineError } from '../../components/ui/InlineError';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { BatchRow } from '../../components/batches/BatchRow';
import { spacing, fontSizes, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<BatchesStackParamList, 'BatchesList'>;

const batchesApi = { listBatches };

export function BatchesListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]);

  const { items, loading, loadingMore, error, refetch, fetchMore } = useBatches(
    batchesApi,
    debouncedSearch || undefined,
  );

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleRowPress = useCallback(
    (batch: BatchListItem) => {
      navigation.navigate('BatchDetail', { batch });
    },
    [navigation],
  );

  const handleAdd = useCallback(() => {
    navigation.navigate('BatchForm', { mode: 'create' });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: BatchListItem }) => (
      <BatchRow batch={item} onPress={() => handleRowPress(item)} />
    ),
    [handleRowPress],
  );

  const keyExtractor = useCallback((item: BatchListItem) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, colors, styles]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <SectionHeader title="Batches" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search batches..."
          placeholderTextColor={colors.textDisabled}
          value={searchText}
          onChangeText={setSearchText}
          testID="batches-search-input"
        />
      </View>

      {error && <InlineError message={error.message} onRetry={refetch} />}

      {loading && !refreshing ? (
        <View testID="skeleton-container" style={styles.skeletons}>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ) : !loading && items.length === 0 ? (
        <EmptyState message="No batches found" />
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={fetchMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          testID="batches-list"
        />
      )}

      <View style={styles.addButtonContainer}>
        <Button title="Add Batch" onPress={handleAdd} testID="add-batch-button" />
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    padding: spacing.base,
    paddingBottom: 0,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: fontSizes.md,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  skeletons: {
    padding: spacing.base,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: 80,
  },
  footer: {
    paddingVertical: spacing.base,
    alignItems: 'center',
  },
  addButtonContainer: {
    position: 'absolute',
    bottom: spacing.base,
    left: spacing.base,
    right: spacing.base,
  },
});
